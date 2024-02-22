import { $ } from "bun";

await $`pwd`;

const server = Bun.serve({
	port: 3000,
	fetch(req: Request): Response | Promise<Response> {
		return new Response(Bun.file("./test_website/test.html"));
	},
});

console.log(`Listening on http://localhost:${server.port} ...`);
