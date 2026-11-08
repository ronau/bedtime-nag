# bedtime-nag

macOS Screen Time "Downtime" only greys out app icons; it doesn't stop you.
This is a nag with teeth: during a bedtime window (default 22:30 to 05:00) a
full-screen **"Go to bed."** overlay covers every display and comes back every
5 minutes until you stop using the Mac. Its **Snooze 5 min** button only
becomes clickable after 20 seconds, so you can't dismiss it on reflex.

Day to day you do nothing: it runs every night by itself. The `bedtime-nag`
command (or Shortcuts calling it) is only for exceptions: skip tonight, pause
for half an hour.

- **Scheduler:** a per-user LaunchAgent (`StartInterval` 300). Shortcuts is only a remote control.
- **No compiled code, no dependencies:** bash for the CLI, JXA (`osascript -l JavaScript`) for the overlay.
- **Local time everywhere**, so DST and timezone changes just work.
- **No sudo, no network, nothing outside your home directory.**
- It is a nag, not a lock: see [Getting out](#getting-out).

![The bedtime overlay on a MacBook screen: a near-black layer covers a browser window, whose page is only faintly visible through it. In the centre is a large white "Go to bed." headline, the subtitle "It is past your bedtime. Future you will thank you.", and a greyed-out "Snooze 5 min (17s)" button that is still counting down.](screenshot.jpg)

## Install / upgrade / uninstall

```sh
git clone <this repo> && cd bedtime-nag
make install            # same as: bin/bedtime-nag install
```

`install` copies `bin/`, `lib/` and `share/` to `~/.local/share/bedtime-nag/`,
symlinks `~/.local/bin/bedtime-nag` (put `~/.local/bin` on your `PATH` if it
isn't), renders the LaunchAgent into
`~/Library/LaunchAgents/local.bedtime-nag.plist` and loads it with
`launchctl bootstrap gui/$(id -u)`.

- **The job runs once immediately** (`RunAtLoad`), so installing inside the
  nag window shows the overlay right away.
- **Upgrade = pull and install again.** `install` is idempotent: it replaces
  the files, re-renders the plist, reloads the job, and leaves your settings
  alone. (Reloading closes an overlay that is currently showing.)
- **macOS will probably show a "Background items added" notice** (listed under
  System Settings > General > Login Items & Extensions). That is expected: it
  is the LaunchAgent.

```sh
make uninstall                          # unload, delete files, symlink and settings
make uninstall ARGS=--keep-settings     # same, but keep the defaults domain
```

`uninstall` (also available as `bedtime-nag uninstall [--keep-settings]`)
unloads the job and removes the plist, the installed files and the symlink,
and deletes the `local.bedtime-nag` defaults domain including the empty
preferences file `defaults delete` leaves behind. It removes `~/.local/bin`
only if that is empty afterwards.

## Commands

`bedtime-nag <command>`:

| Command | Effect |
|---|---|
| `status` (default) | Show enabled/disabled, window, pause expiry, whether the launchd job is loaded |
| `on` | Enable and clear any pause |
| `off` | Disable until `on` (persists) |
| `pause [min]` | Suppress nagging for N minutes (default 60); stored as an absolute time |
| `skip` | Suppress until the next wake time (skip tonight) |
| `resume` | Clear a pause or skip |
| `bedtime HH:MM` / `wake HH:MM` | Set the window start / end (24h clock) |
| `now` | Show the overlay immediately, ignoring all settings; returns at once |
| `install` / `uninstall` | See above |

A window whose bedtime equals its wake time is empty, so it never nags. Windows
may cross midnight (22:30 to 05:00) or not (13:00 to 14:00).

## Shortcuts

Shortcuts is just a button for the CLI. For each one: **New Shortcut >
Run Shell Script**, and paste the command. Use the **full path**, because
Shortcuts runs with a minimal `PATH`.

| Shortcut | Command |
|---|---|
| Skip tonight | `~/.local/bin/bedtime-nag skip` |
| Pause 30 min | `~/.local/bin/bedtime-nag pause 30` |
| Back on | `~/.local/bin/bedtime-nag on` |
| Show it now | `~/.local/bin/bedtime-nag now` |

An open overlay closes within about a second of `skip`, `pause` or `off`.

### Optional: stop nagging once you're actually in bed

In Shortcuts, **Automation > New Automation > Focus > Sleep > When turning on**,
choose **Run Immediately**, and give it a **Run Shell Script** action with
`~/.local/bin/bedtime-nag skip`. When your Sleep Focus kicks in, the nagging
stops until the next wake time.

## Settings and constants

Settings live in the defaults domain `local.bedtime-nag` and are changed with
the commands above (`defaults read local.bedtime-nag` shows them):

| Key | Type | Meaning |
|---|---|---|
| `disabled` | bool | set by `off` |
| `pauseUntil` | epoch seconds | set by `pause` / `skip` |
| `start` | "HH:MM" | set by `bedtime`, default 22:30 |
| `end` | "HH:MM" | set by `wake`, default 05:00 |

Constants live in one file, [share/bedtime-nag.conf](share/bedtime-nag.conf):
the default window, `INTERVAL` (300 s), `UNLOCK_AFTER` (20 s) and the two
lines of overlay text, `TITLE` ("Go to bed.") and `SUBTITLE`. The button label
is derived from `INTERVAL` ("Snooze 5 min"), so it can't drift from the real
snooze length.

**Overlay text.** `TITLE` and `SUBTITLE` are plain text: one line each, UTF-8,
and emoji work, in colour (tested with ZWJ sequences, flags and skin tones).
Write the text as it should appear: everything after the first `=` is taken
literally, so no quotes or escaping, and apostrophes, `$` and backticks are
fine. Fonts and sizes are fixed (title 72 pt bold, subtitle 24 pt). Text is
not wrapped: a line too wide for the screen starts at the left edge and is cut
off on the right. On a 1440 pt wide screen that is roughly 40 characters for
the title and 140 for the subtitle. To preview a change before installing, run
`./bin/bedtime-nag now` from the checkout: it uses the checkout's conf, while
`bedtime-nag now` from your `PATH` uses the installed one.

The job reads the *installed* copy of that file, so edit the one in the repo
and run `make install` to apply a change.

**Changing `INTERVAL` always requires another `make install`.** launchd takes
the interval from `StartInterval` in the rendered plist, and only `install`
regenerates that. Skip it and the job keeps firing at the old rate while the
button label (derived from the conf) already shows the new one.
`UNLOCK_AFTER`, the default window and the overlay text need no reload: they
are picked up from the installed conf the next time the overlay starts.

## How it behaves

- Every 5 minutes launchd runs `lib/nag.js`. Outside the window, or when off or
  paused, it exits silently after about 0.06 s. Inside, it opens a borderless
  dark window on every screen at the shielding level (above the menu bar and
  Dock) on all Spaces, and takes keyboard focus so typing is swallowed (but
  see [Known limitation](#known-limitation-cmd-tab)).
- Clicking Snooze quits the process. launchd waits one full interval **after
  the job exits** before starting it again, so the snooze is always 5 minutes,
  however long the overlay was open. launchd never runs two copies at once.
- A 1-second timer re-reads the settings, so `off` / `pause` / `skip` /
  leaving the window closes an overlay that is already open. Leave it up
  overnight and it closes itself when the window ends.
- A tick that lands while the Mac is asleep is missed, not queued (see
  `StartInterval` in `man launchd.plist`); the nag resumes at the next tick.
- `skip` computes tomorrow's wake time with `date`'s calendar arithmetic in
  local time, so it is right on the night the clocks change.
- `now` is started by the CLI, not by launchd, so it can stack on top of an
  overlay launchd already opened.

## Known limitation: Cmd-Tab

The overlay covers every screen and takes keyboard focus, but it cannot stop
you from switching apps: **Cmd-Tab still works.** Once you have switched, the
overlay is no longer the active app, so what you type goes to the app hidden
underneath. The overlay stays on top, though, so you type blind and can't see
or click that app.

I tried asking macOS to disable app switching while the overlay is up
(`NSApplicationPresentationDisableProcessSwitching`). The system reported the
option as in effect, but Cmd-Tab kept working (macOS 27.2), so it was removed
again. Taking focus back whenever the overlay loses it would be the next thing
to try.

## Getting out

It is a nag, not a lock. The Snooze button unlocks after 20 s, and
`bedtime-nag off` / `pause` / `skip`, run from anywhere (another terminal, an
SSH session, a Shortcut), close an open overlay within about a second.

## Troubleshooting

```sh
bedtime-nag status                                  # settings + is the job loaded?
launchctl print gui/$(id -u)/local.bedtime-nag      # state, runs, last exit code
NAG_FORCE=1 osascript -l JavaScript ~/.local/share/bedtime-nag/lib/nag.js
                                                    # run the overlay in the foreground, errors on stderr
pkill -f lib/nag.js                                 # get rid of an overlay from a shell
```

## Layout

```
bin/bedtime-nag                         the CLI (bash 3.2)
lib/nag.js                              the overlay (JXA)
share/bedtime-nag.conf                  constants and overlay text, read by both
share/local.bedtime-nag.plist.template  LaunchAgent plist, filled in by install
Makefile                                make install / make uninstall
README.md                               this file
LICENSE                                 license text
```
