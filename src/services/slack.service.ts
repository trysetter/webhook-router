interface SlackMessage {
	channel: string;
	text?: string;
	attachments?: {}[];
	thread_ts?: string;
}

export class SlackService {
	private token: string;

	constructor(token: string) {
		this.token = token;
	}

	async sendMessage(options: SlackMessage): Promise<Response> {
		const url = 'https://slack.com/api/chat.postMessage';

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.token}`,
			},
			body: JSON.stringify({
				...options,
			}),
		});

		if (!response.ok) {
			console.error('Slack API HTTP error:', response.status, response.statusText);
			throw new Error(`Failed to send message to Slack`);
		}

		return response;
	}

	async sendWebhookNotification(payload: any, channelId: string): Promise<void> {
		try {
			// Send initial message
			const response = await this.sendMessage({
				channel: channelId,
				text: `Webhook forwarded successfully`,
			});

			const responseJson: any = await response.json();
			if (!responseJson.ok) {
				console.error('Slack API error:', responseJson);
				return;
			}

			const threadTs = responseJson.ts;

			// Send payload in thread
			await this.sendMessage({
				channel: channelId,
				thread_ts: threadTs,
				text: `Payload: \n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
			});

			console.log('Slack notification sent successfully');
		} catch (error) {
			console.error('Failed to send Slack notification:', error);
		}
	}

	/**
	 * Not an endpoint from the Slack API, but a convenience method to send a message and a thread message sequentially.
	 */
	async sendMessageWithThread(options: {
		channel: string;
		text?: string;
		threadText?: string;
		attachments?: {}[];
	}): Promise<void> {
		const response = await this.sendMessage({
			...options,
		});

		const responseJson: any = await response.json();
		const threadTs = responseJson.ts;

		await this.sendMessage({
			channel: options.channel,
			thread_ts: threadTs,
			text: options.threadText,
		});
	}
} 