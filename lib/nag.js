ObjC.import('Cocoa');
ObjC.import('stdlib');

// Settings live in the "local.bedtime-nag" defaults domain and are changed
// with `bedtime-nag`. Keys: disabled (bool), pauseUntil (epoch secs),
// start / end ("HH:MM"). Constants come from ../share/bedtime-nag.conf.

function readConf() {
  const script = ObjC.unwrap($.NSProcessInfo.processInfo.arguments)
    .map(a => ObjC.unwrap(a)).filter(a => /\.js$/.test(a))[0];
  const url = $.NSURL.fileURLWithPath(script)
    .URLByDeletingLastPathComponent.URLByDeletingLastPathComponent
    .URLByAppendingPathComponent('share/bedtime-nag.conf');
  const text = ObjC.unwrap($.NSString.stringWithContentsOfURLEncodingError(
    url, $.NSUTF8StringEncoding, null));
  if (text === undefined) throw new Error('cannot read ' + ObjC.unwrap(url.path));
  const conf = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m) conf[m[1]] = m[2];
  }
  const missing = ['DEFAULT_START', 'DEFAULT_END', 'INTERVAL', 'UNLOCK_AFTER', 'TITLE', 'SUBTITLE']
    .filter(k => conf[k] === undefined);
  if (missing.length) throw new Error(ObjC.unwrap(url.path) + ' is missing: ' + missing.join(', '));
  return conf;
}

const CONF = readConf();
const DEFAULT_START = CONF.DEFAULT_START;
const DEFAULT_END = CONF.DEFAULT_END;
const TITLE = CONF.TITLE;
const SUBTITLE = CONF.SUBTITLE;
const UNLOCK_AFTER = parseInt(CONF.UNLOCK_AFTER, 10);
const SNOOZE_LABEL = 'Snooze ' + Math.round(parseInt(CONF.INTERVAL, 10) / 60) + ' min';

const ud = $.NSUserDefaults.alloc.initWithSuiteName('local.bedtime-nag');

function cfg(key, dflt) {
  try {
    const v = ObjC.unwrap(ud.objectForKey(key));
    return (v === undefined || v === null) ? dflt : v;
  } catch (e) {
    return dflt;
  }
}

function toMin(s, dflt) {
  const p = String(s).split(':');
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  return (isNaN(h) || isNaN(m)) ? dflt : h * 60 + m;
}

function shouldNag() {
  if (cfg('disabled', false)) return false;
  if (cfg('pauseUntil', 0) > Date.now() / 1000) return false;
  const S = toMin(cfg('start', DEFAULT_START), toMin(DEFAULT_START, 22 * 60 + 30));
  const E = toMin(cfg('end', DEFAULT_END), toMin(DEFAULT_END, 5 * 60));
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  return S <= E ? (m >= S && m < E) : (m >= S || m < E);
}

// Centre a one-line label by geometry. Don't use setAlignment(NSTextAlignmentCenter):
// JXA hands over 2, which on Apple silicon (iOS-style enum values) means *right*,
// so the text ended up flush against the right edge of the screen. Left (0) is
// the same on every ABI.
function centreLabel(label, screenWidth, y, height) {
  const width = Math.min(screenWidth, Math.ceil(label.cell.cellSize.width) + 4);
  label.setFrame($.NSMakeRect((screenWidth - width) / 2, y, width, height));
}

function run() {
  const force = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('NAG_FORCE'));
  if (!force && !shouldNag()) return;

  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  // No Cmd-Tab while the overlay is up, so you can't switch to an app hidden
  // underneath and type there. AppKit only accepts DisableProcessSwitching
  // together with HideDock (the Dock is under the overlay anyway). Deliberately
  // nothing more: Force Quit stays available (a nag, not a lock). Applies while
  // this app is active. (JXA hands NSUInteger constants over as strings,
  // hence Number().)
  app.setPresentationOptions(
    Number($.NSApplicationPresentationHideDock) |
    Number($.NSApplicationPresentationDisableProcessSwitching));

  let remaining = UNLOCK_AFTER;
  const buttons = [];
  const windows = [];

  ObjC.registerSubclass({
    name: 'NagHandler',
    methods: {
      'snooze:': {
        types: ['void', ['id']],
        implementation: function (sender) { $.exit(0); }
      },
      'tick:': {
        types: ['void', ['id']],
        implementation: function (timer) {
          // Re-checked every second, so "off" / "pause" / "skip" from
          // Shortcuts closes an overlay that is already showing.
          if (!force && !shouldNag()) $.exit(0);
          remaining = Math.max(0, remaining - 1);
          for (const b of buttons) {
            if (remaining > 0) {
              b.setTitle(SNOOZE_LABEL + ' (' + remaining + 's)');
            } else {
              b.setTitle(SNOOZE_LABEL);
              b.setEnabled(true);
            }
          }
        }
      }
    }
  });
  const handler = $.NagHandler.alloc.init;

  // A borderless NSWindow can't become key, so keystrokes would never reach
  // it. This subclass can, and it swallows typing (silently, no beep).
  ObjC.registerSubclass({
    name: 'NagWindow',
    superclass: 'NSWindow',
    methods: {
      'canBecomeKeyWindow': { types: ['bool', []], implementation: function () { return true; } },
      'canBecomeMainWindow': { types: ['bool', []], implementation: function () { return true; } },
      'keyDown:': { types: ['void', ['id']], implementation: function (event) {} }
    }
  });

  // NSScreen.screens.count is a string in JXA; iterate the unwrapped array.
  for (const screen of ObjC.unwrap($.NSScreen.screens)) {
    const frame = screen.frame;
    const w = frame.size.width, h = frame.size.height;

    const win = $.NagWindow.alloc.initWithContentRectStyleMaskBackingDefer(
      frame, $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false);
    windows.push(win);  // keep a JS reference so the window isn't collected
    win.setLevel($.CGShieldingWindowLevel());
    win.setOpaque(false);
    win.setBackgroundColor($.NSColor.colorWithCalibratedWhiteAlpha(0.04, 0.97));
    win.setCollectionBehavior(
      $.NSWindowCollectionBehaviorCanJoinAllSpaces |
      $.NSWindowCollectionBehaviorFullScreenAuxiliary |
      $.NSWindowCollectionBehaviorStationary);

    const label = $.NSTextField.labelWithString(TITLE);
    label.setFont($.NSFont.systemFontOfSizeWeight(72, $.NSFontWeightBold));
    label.setTextColor($.NSColor.whiteColor);
    centreLabel(label, w, h / 2 - 20, 100);
    win.contentView.addSubview(label);

    const sub = $.NSTextField.labelWithString(SUBTITLE);
    sub.setFont($.NSFont.systemFontOfSize(24));
    sub.setTextColor($.NSColor.colorWithCalibratedWhiteAlpha(0.75, 1.0));
    centreLabel(sub, w, h / 2 - 70, 40);
    win.contentView.addSubview(sub);

    const btn = $.NSButton.alloc.initWithFrame($.NSMakeRect(w / 2 - 110, h / 2 - 150, 220, 36));
    btn.setBezelStyle($.NSBezelStyleRounded);
    btn.setTitle(SNOOZE_LABEL + ' (' + remaining + 's)');
    btn.setEnabled(false);
    btn.setTarget(handler);
    btn.setAction('snooze:');
    win.contentView.addSubview(btn);
    buttons.push(btn);

    win.makeKeyAndOrderFront(null);
  }

  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(1.0, handler, 'tick:', null, true);
  app.activateIgnoringOtherApps(true);
  app.run;
}
