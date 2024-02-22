const server = Bun.serve({
	port: 3000,
	fetch(request) {
		// return the test.html file
		return Bun.file("test.html");
	},
});

export { SchematicRenderer } from "./schematic_renderer";
