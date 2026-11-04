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
the default window, `INTERVAL` (300 s) and `UNLOCK_AFTER` (20 s). The button
label is derived from `INTERVAL` ("Snooze 5 min"), so it can't drift from the
real snooze length. After editing, run `bedtime-nag install` to apply (the
interval is baked into the plist).

## How it behaves

- Every 5 minutes launchd runs `lib/nag.js`. Outside the window, or when off or
  paused, it exits silently after about 0.06 s. Inside, it opens a borderless
  dark window on every screen at the shielding level (above the menu bar and
  Dock) on all Spaces, and takes keyboard focus so typing is swallowed.
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
bin/bedtime-nag                    the CLI (bash 3.2)
lib/nag.js                         the overlay (JXA)
share/bedtime-nag.conf             constants shared by both
share/local.bedtime-nag.plist.template
Makefile                           make install / make uninstall
```
