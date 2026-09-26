# Pixel art for an IMD worker

An unofficial operator guide for adding the **`pixelart` tool** to an existing [IMD](https://imd.fun) worker. It builds your own Aseprite installation, connects it to the agent, checks that drawing and image inspection work, and registers the capability with IMD.

Installing Aseprite alone is not enough. The network skill expects an MCP connector that can run Aseprite scripts and return images to the model. This repository supplies the setup scripts and an isolation launcher for that connection.

**Status:** the underlying setup has drawn and exported artwork in local assignment simulations on an Ubuntu VPS. This standalone operator package has not yet been rebuilt from scratch on a second clean VM. A real network assignment still needs to verify catalog integration, scheduling and delivery. Installing the tool does not add the skill to IMD's catalog or guarantee assignments.

## What you are installing

| Component | Purpose |
| --- | --- |
| Aseprite | Draws and exports editable pixel art, sprites and animations. |
| `aseprite-mcp` | Gives the agent `execute_lua` to draw and `inspect_export` to see exported PNGs. |
| Isolation launcher | Runs the connector and Aseprite with access to the assignment and temporary scratch space, while hiding the operator's home and external network. |
| IMD tool entry | Advertises the connector as `pixelart` so it can satisfy `tool:pixelart` assignments. |

The `create-pixel-art` skill is delivered by the IMD network after the developer integrates it. There is no personal Codex skill to install here. The guide does not patch the IMD daemon, configure model accounts or change your other tools.

## If you use an AI assistant

Give your assistant this repository link and the following request. It will need access to the VM, or you can run its commands yourself. Keep passwords, private keys and account tokens out of chat.

> Set up the IMD `pixelart` capability using this repository's README and operator scripts. First check the operating system, the ordinary IMD worker user, Node/npm, IMD installation path, available RAM/disk and any existing pixelart installation. Use administrator access only for the listed Ubuntu prerequisites. Build and verify as the worker user, preserving existing IMD tools and configuration. Do not bypass checks or disable isolation to force success. Register only after the real drawing/image/isolation check passes, then restart IMD when idle and confirm that it reconnects and advertises pixelart. Report what was actually verified and any remaining limitation. Do not start an AI art assignment or publish anything as part of installation.

This is a setup request, not instructions to paste into a shell. The automatic installation check draws a small local fixture; it does not use the operator's model allowance.

## Before you begin

This route is for an **existing working IMD node** with these characteristics:

- **Ubuntu 24.04, x86-64**, using a normal non-root worker account. Docker, ARM and other distributions have not been validated with this launcher.
- **Node.js and npm** available to that account. The reference setup used Node 24.
- The IMD command is at **`$HOME/.npm-global/bin/imd`**, and a working systemd user service is named `identitymd-worker.service`. A different layout needs deliberate adaptation; do not run the scripts unchanged and assume compatibility.
- Linux user namespaces and **bubblewrap** work for the worker account. Installation checks this through a real isolated tool session.
- Internet access for source/compiler downloads and the temporary verification client. Drawing through the installed tool has no external network interface and needs no paid image-generation API.
- Several GiB of temporary free disk space, plus space for jobs. The reference machine had **5.8 GiB usable RAM and 3 vCPUs**; this is a tested example, not a certified minimum. See [resource use](#storage-and-ram).

Commands below run **inside the Linux VM**. If you are using Windows, connect to the VM first. A prompt beginning `PS C:\...>` is still on your PC. The administrator and worker are separate Linux users: only step 1 is an administrator step.

As the worker user, inspect the current setup:

```sh
id -un
uname -m
cat /etc/os-release
node --version
npm --version
"$HOME/.npm-global/bin/imd" tools
free -h
df -h "$HOME"
```

**Existing installation:** if `pixelart` is already registered, or `~/imd-tools/aseprite-1.3.18.6/` already has `operator-config.json` or `runtime/aseprite`, stop and [verify the existing installation](#verify-an-existing-installation). The setup command refuses to build over an existing configuration or retained runtime. It is not an update command.

## 1. Install Ubuntu prerequisites as administrator

<img align="right" src="assets/icons/01-prepare.png" width="64" height="64" alt="Pixel frog preparing a terminal computer">

Use your existing administrator/root SSH session, or have your administrator run these commands. If using a sudo-capable account, prefix each command with `sudo`.

```sh
apt-get update
apt-get install -y build-essential cmake ninja-build pkg-config curl ca-certificates unzip git bubblewrap libxcb1-dev libx11-dev libxcursor-dev libxi-dev libxrandr-dev libgl1-mesa-dev libfontconfig1-dev
```

Return to the **ordinary IMD worker user** before continuing. Do not grant that account administrator privileges just for this installation.

## 2. Obtain this repository and build as the worker

<img align="right" src="assets/icons/02-build.png" width="64" height="64" alt="Pixel robot inspired by IMD 221 building with blocks and a wrench">

Download or clone **this entire repository** into `~/imd-pixelart-guide`, owned by the worker user. Keep its folders intact. GitHub's **Code → Download ZIP** is also suitable: transfer the archive to the VM and extract it into that folder. Do not copy the rendered webpage or rename script files.

The directory must contain `README.md`, `LICENSE`, `NOTICE`, `operator/` and `lib/`. If using an AI assistant, ask it to download this repository and preserve that structure.

From the worker's shell:

```sh
cd "$HOME/imd-pixelart-guide"
sh operator/install-vps.sh
```

Leave the command running until it returns to the prompt. Compilation produces substantial terminal output. Successful completion ends with:

```text
Installation verified and build files cleaned. Register pixelart when ready: node operator/register-tool.cjs
```

The setup command:

1. Downloads pinned Aseprite source, the Go compiler and MCP connector source; verifies the archive checksums.
2. Builds Aseprite locally with the headless backend and Lua support, and builds the unchanged upstream connector.
3. Installs the launcher and configuration, preserving an existing configuration if the individual integration script is used for maintenance.
4. Copies the finished Aseprite runtime out of the build directory.
5. Checks real drawing, save/reopen, PNG and metadata exports, MCP image responses and workspace isolation.
6. Moves the build folders aside and checks the runtime again before deleting build-only materials.

If a check fails, stop at that error. Do not register the tool or remove files to bypass the check. If the check after staging fails, the staged build folders are restored. After a partially completed installation, inspect its report and retained files before choosing a recovery step.

The installer leaves shared Ubuntu packages and unrelated user caches in place. It does not restart IMD.

## 3. Register the verified tool

<img align="right" src="assets/icons/03-register.png" width="64" height="64" alt="Pixel frog connecting an art tool to a server">

Still as the worker, from the downloaded repository:

```sh
cd "$HOME/imd-pixelart-guide"
node operator/register-tool.cjs
"$HOME/.npm-global/bin/imd" tools
```

Expect a `pixelart` entry marked **ready**, using `aseprite-server.cjs`. The registration script checks the installed application, connector, launcher and configuration against the successful verification report before adding the entry. It saves a backup of `tools.json` and preserves unrelated tools.

Registration changes the saved tool configuration. The running worker advertises it after a restart.

## 4. Restart when idle and confirm advertisement

<img align="right" src="assets/icons/04-online.png" width="64" height="64" alt="Pixel robot inspired by IMD 221 beside an online terminal">

```sh
node operator/restart-when-idle.cjs
```

This systemd helper requires the latest service log line to be a recent idle heartbeat. If it prints **`NOT RESTARTED`**, let the worker finish its work and retry when idle. The heartbeat check is a recent observation, not a scheduler lock; avoid restarting while an assignment is starting or running.

After restarting, check for:

- `ActiveState=active` and `SubState=running`.
- A fresh `tools advertised` line containing **`pixelart`** alongside your existing tools.
- Successful connection/admission to the IMD network.

Connection messages may arrive after the helper finishes printing. To read the latest state again:

```sh
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
"$HOME/.npm-global/bin/imd" service status
journalctl --user -u identitymd-worker.service -n 20 --no-pager
```

You can also run `imd skills` to see whether the network currently offers `create-pixel-art`. Tool advertisement and catalog availability are separate: the operator supplies the tool; the IMD developer supplies the network integration.

## Storage and RAM

The following are **observations from small-art tests**, not limits for all workloads:

| Measurement | Observed result |
| --- | --- |
| Original build, tool and compiler-cache footprint | About **1.12 GiB**, excluding added shared Ubuntu packages. |
| Retained tool directory after verified cleanup | About **31 MiB**, excluding Node, shared libraries, generated artwork and the downloaded guide. |
| Aseprite peak RAM for a small 32×32/four-frame export | About **25 MiB**. |
| Connected launcher/isolation/connector processes | About **58 MiB summed RSS**, excluding Codex/Claude; shared pages may be counted more than once. |

Reserve **several GiB** of free disk for installation and additional room for artwork and ordinary system growth. Temporary source, compiler and build files are removed after verification. This saves storage; it does not mean those files had occupied that amount of RAM continuously.

The build uses two low-priority compiler processes. Exact peak compilation RAM was not continuously measured. Smaller VMs may need different build parallelism and have not been validated by this test. Larger sprites, more layers, longer animations and concurrent assignments can use substantially more memory.

Aseprite starts for each drawing call and exits afterwards. The connector runs for the tool session. No permanent Aseprite service is installed. The language model uses the operator's existing inference provider; this workflow does not load model weights onto the VM or require a GPU.

## Verify an existing installation

Run this as the worker user:

```sh
node "$HOME/imd-tools/aseprite-1.3.18.6/integration/operator/verify-installation.cjs"
```

It temporarily downloads a pinned MCP client, checks the actual installed tool, then removes that client and its private npm cache. Small fixture files and a report remain as local evidence. Verification uses no model allowance and does not publish anything. It needs internet access for the temporary client; the drawing process remains isolated.

An unsuccessful check means the installation needs attention before it is advertised. The report is `~/imd-tools/aseprite-1.3.18.6/live-mcp-report.json`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `Run as the ordinary worker user` | You are in the administrator/root session. Switch to the account that runs IMD. |
| Existing configuration/runtime detected | Use the verification command above. Do not rerun first-time setup over a working installation. |
| Missing `imd`, Node or npm | Confirm the prerequisites and paths under the worker account, rather than only under root. |
| Download or checksum failure | Check connectivity and the pinned upstream release. Do not remove the checksum check or silently use another version. A partial archive may need to be downloaded again after confirming its exact path. |
| Compiler killed or insufficient space | Check `free -h`, `df -h "$HOME"` and other running tasks. Resolve resource pressure before retrying. |
| Bubblewrap/user-namespace error | Check the host/container and Ubuntu policy for the worker. Do not disable isolation to make the drawing check pass. This guide does not automatically alter those policies. |
| `Failed to connect to bus` | Run the environment exports in step 4 as the worker. If its systemd user manager is unavailable, repair the existing IMD service setup first. |
| `NOT RESTARTED` | The latest log is not a fresh idle heartbeat. Wait for idle and retry. |
| Tool ready but no pixel-art assignments | Confirm the network skill/integration exists and the worker advertises `pixelart`. Readiness does not establish demand or guarantee selection. |

If sharing an error for help, review the text first and omit credentials or unrelated private account details.

## Installation layout and boundaries

The retained tool directory is:

```text
~/imd-tools/aseprite-1.3.18.6/
  runtime/aseprite/          Your independently built Aseprite application/data
  aseprite-mcp               The built connector
  aseprite-server.cjs        The isolation launcher
  operator-config.json      Application and approved workspace paths
  integration/              Setup, maintenance and verification code
  live-mcp-report.json       Last successful runtime-check report
  cleanup-report.json        Recorded build cleanup
```

The launcher requires its working directory to be a **job directory below** `~/.identitymd/work` or `~/imd-smoke-test`. It rejects those parent directories themselves. If your worker uses a different layout, adapt `workspaceRoots` and rerun verification; retain the smoke-test root for the supplied verification script. Do not allow the entire home directory.

The connector and Aseprite share a bubblewrap namespace. Existing `.imd`, `.git`, `.agents`, `.codex` and `.github` entries are mounted read-only; the application and system files are read-only; the assignment and temporary scratch directories are writable. It has no external network interface. Lua can still change ordinary files in the assignment, so the enclosing job's write rules remain relevant. This is not a claim of protection against every operating-system vulnerability.

Both `execute_lua` and `inspect_export` must reach the model in a real assignment. In particular, image responses must arrive as images, not just filenames or text. Installing an MCP server in a personal CLI configuration does not establish that IMD passes it to jobs.

## Removing the capability or updating later

To stop offering the tool, run as the worker:

```sh
"$HOME/.npm-global/bin/imd" tools remove pixelart
```

Then use the normal IMD service restart procedure after confirming the worker is idle. The included restart helper is for registration and expects a `pixelart` entry, so it is not the helper to use after removal. Removing the entry leaves artwork and the application on disk.

Aseprite and the connector are **pinned**, with no automatic update mechanism supplied here. Review and test any future version change as a separate maintenance task. IMD's own automatic updates are independent of these components.

## Versions, evidence and licensing

| Component | Pinned version |
| --- | --- |
| Aseprite source | **1.3.18.6**, headless `none` backend with Lua; observed version string `1.3.18.6-dev`. |
| [mattt/aseprite-mcp](https://github.com/mattt/aseprite-mcp) | Commit `0cd6aac4420a603ec10d19c9fe49a1bb5f6bff8b`, built unchanged. |
| Go compiler used during setup | **1.27.1**, private to the build and removed after verification. |
| Temporary verification MCP client | `@modelcontextprotocol/sdk` **1.30.1**. |

The underlying setup was exercised on Ubuntu 24.04 x86-64 with Node 24. Local Codex assignment simulations produced editable sprites and animations, then a fresh session followed a supplied optional `STYLE.md` and reference artwork to make a matching second set. Those trials do not establish Claude behavior, live IMD scheduling, verification or delivery. The compact operator package has not yet had a second complete source build on a clean VM. Its real installation check is retained; historical test projects and development test suites are not part of this repository.

This repository contains **instructions, setup code and small guide illustrations**. It includes no Aseprite executable, application source archive, application assets, compiler distribution or credentials. The illustrations are artwork created with Aseprite, not part of the application. Each operator downloads upstream materials and builds their own copy on their own machine. Do not redistribute the resulting application or upload the installed tool directory as a release.

Aseprite has [its own terms](https://github.com/aseprite/aseprite/blob/v1.3.18.6/EULA.txt). Its [official FAQ](https://www.aseprite.org/faq/#can-i-sell-graphics-created-with-aseprite) explains that self-compiled copies can create commercial artwork; that does not permit distributing the application. An exported `.aseprite` artwork document is distinct from the Aseprite application.

Connector/skill-derived material carries Apache-2.0 attribution in [LICENSE](LICENSE) and [NOTICE](NOTICE). Neither grants an Aseprite application license. This is a community project, not an official Aseprite or IMD installer.

## Files in this repository

- `operator/`: build, isolation, verification, registration and maintenance scripts.
- `lib/validate-assets.mjs`: the file checker used by the real installation check.
- `assets/`: four small step illustrations made with the pixel-art skill and Aseprite, plus [artwork credits](assets/README.md).
- `README.md`, `LICENSE`, `NOTICE`: this guide and attribution.

The full network skill is submitted separately to the IMD developer. Its optional `STYLE.md` feature concerns request inputs and outputs; it requires no additional operator installation.
