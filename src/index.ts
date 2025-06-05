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

import { SlackService } from './services/slack.service';

export interface Env {
	// Add your environment variables here
	SECRET_SLACK_API_KEY: string;
}

// Define the expected payload structure
interface WebhookPayload {
	contactMetadata: {
		webhookUrl: string;
	};
	[key: string]: unknown; // Allow additional properties
}

// Secondary webhook endpoint
const SECONDARY_WEBHOOK_URL = 'https://webhook.site/20ec8a66-3d2f-4459-b8eb-38a8ada380b2';

// Slack configuration
const SLACK_CHANNEL_ID = 'C088XCR01L3';

// Error handler function
const errorHandler = (error: unknown): Response => {
	console.error('Error:', error);
	return new Response('Bad request', { status: 400 });
};

// Function to forward to secondary webhook
const forwardToSecondaryWebhook = async (payload: WebhookPayload): Promise<void> => {
	try {
		const bodyPayload = JSON.stringify(payload);
		console.log('Secondary webhook payload:', bodyPayload);
		
		await fetch(SECONDARY_WEBHOOK_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: bodyPayload,
		});
		console.log('Secondary webhook forwarded successfully');
	} catch (error) {
		// Log the error but don't fail the primary request
		console.error('Secondary webhook forwarding failed:', error);
	}
};

// Safe Slack notification wrapper - can never crash the main operations
const safeSlackNotification = async (payload: WebhookPayload, env: Env): Promise<void> => {
	try {
		const slackService = new SlackService(env.SECRET_SLACK_API_KEY);
		await slackService.sendWebhookNotification(payload, SLACK_CHANNEL_ID);
	} catch (error) {
		// Log the error but never let it bubble up
		console.error('Slack notification failed (safely handled):', error);
	}
};

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

			// Forward the request to the primary webhook URL
			const bodyPayload = JSON.stringify(payload);
			console.log('Primary webhook payload:', bodyPayload);
			
			const response = await fetch(webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: bodyPayload,
			});

			// Forward to secondary webhook in the background
			// Use waitUntil to ensure it completes even after response is sent
			ctx.waitUntil(forwardToSecondaryWebhook(payload));

			// Send Slack notification in the background
			ctx.waitUntil(safeSlackNotification(payload, env));

			// If the response was successful, return a simple OK response
			if (response.ok) {
				return new Response(
					JSON.stringify({ success: true, message: "Webhook forwarded successfully" }),
					{ 
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}

			// If not successful, return the original error response
			return new Response(response.body, {
				status: response.status,
				headers: response.headers,
			});

		} catch (error) {
			return errorHandler(error);
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
