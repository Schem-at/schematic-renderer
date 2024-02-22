// print the current working directory
console.log(`Current working directory: ${Deno.cwd()}`);

const server = Bun.serve({
	port: 3000,
	fetch(req: Request): Response | Promise<Response> {
		return new Response(Bun.file("./test_website/index.html"));
	},
});

console.log(`Listening on http://localhost:${server.port} ...`);
