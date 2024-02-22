const server = Bun.serve({
	port: 3000,
	fetch(request) {
		return Bun.file("test.html");
	},
});

export { SchematicRenderer } from "./schematic_renderer";
