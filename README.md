# Schematic renderer

A renderer for Minecraft schematics.

## Setup

### 1. Installing Bun

If you do not have it already, you can find instructions on how to install Bun on [the official website](https://bun.sh/docs/installation).

Step by step instructions:

#### Mac / Linux / WSL

```bash
curl -fsSL https://bun.sh/install | bash
```

You will also have to source your `.bashrc` to apply the changes.

#### Windows

```cmd
powershell -c "irm bun.sh/install.ps1|iex"
```

Don't forget to close and restart your terminal for the changes to apply.

### 2. Installing dependencies

Navigate to the project directory and install the dependencies using:

```bash
bun install
```

## Running the renderer

Open **two separate terminal** windows and run the following commands in each:

### 1. Start the CORS proxy

This allows us to bypass the CORS policy in order to download a resource pack.

```bash
bun run cors-proxy.js
```

To stop it, press `Ctrl+C` (or `Cmd+C` on Mac).

### 2. Start the renderer

```bash
bun run start
```

A window or tab will open in your browser and the render will start.

You can simply stop it by pressing `q` in the terminal.

## Usage

Controls:
- Drag using left click to rotate the camera
- Drag using right click to move the camera
- Use the scroll wheel to zoom

For testing purposes, the schematic is hardcoded for now. You can change it in [`main.ts`](test/main.ts) where example schematics are also provided.

```ts
getAllResourcePackBlobs().then((resourcePackBlobs) => {
	const renderer = new SchematicRenderer(canvas, SCHEMATIC_BASE64_HERE, {
		resourcePackBlobs,
	});
});
```