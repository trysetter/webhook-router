/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Add your environment variables here
}

// Define the expected payload structure
interface WebhookPayload {
	contactMetadata: {
		webhookUrl: string;
	};
	[key: string]: unknown; // Allow additional properties
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Only allow POST requests
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			// Parse the request body with type assertion
			const payload = await request.json() as WebhookPayload;

			// Extract webhook URL from payload
			const webhookUrl = payload?.contactMetadata?.webhookUrl;

			// Validate webhook URL
			if (!webhookUrl || !isValidUrl(webhookUrl)) {
				return new Response('Invalid webhook URL', { status: 400 });
			}

			// Prevent infinite loops by checking if webhook URL is pointing to our own endpoint
			const requestUrl = new URL(request.url);
			const targetUrl = new URL(webhookUrl);
			
			if (requestUrl.hostname === targetUrl.hostname && requestUrl.pathname === targetUrl.pathname) {
				return new Response('Cannot forward webhook to itself', { status: 400 });
			}

			// Forward the request to the webhook URL
			const response = await fetch(webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			// Return the response from the webhook
			return new Response(response.body, {
				status: response.status,
				headers: response.headers,
			});

		} catch (error) {
			return new Response('Bad request', { status: 400 });
		}
	},
} satisfies ExportedHandler<Env>;

// Helper function to validate URLs
function isValidUrl(string: string): boolean {
	try {
		new URL(string);
		return true;
	} catch (_) {
		return false;
	}
}
