import { invoke } from './ipc';
import type { PromptMessage, ModelKind } from '$lib/aiTypes';
import { PUBLIC_API_BASE_URL } from '$env/static/public';

const apiUrl = new URL('/api/', new URL(PUBLIC_API_BASE_URL));

function getUrl(path: string) {
	return new URL(path, apiUrl).toString();
}

export type Feedback = {
	id: number;
	user_id: number;
	feedback: string;
	context: string;
	created_at: string;
	updated_at: string;
};

export type LoginToken = {
	token: string;
	expires: string;
	url: string;
};

export class User {
	id!: number;
	name: string | undefined;
	given_name: string | undefined;
	family_name: string | undefined;
	email!: string;
	picture!: string;
	locale!: string;
	created_at!: string;
	updated_at!: string;
	access_token!: string;
	role: string | undefined;
	supporter!: boolean;
	github_access_token: string | undefined;
	github_username: string | undefined;
}

export type Project = {
	name: string;
	description: string | null;
	repository_id: string;
	git_url: string;
	created_at: string;
	updated_at: string;
};

async function parseResponseJSON(response: Response) {
	if (response.status === 204 || response.status === 205) {
		return null;
	} else if (response.status >= 400) {
		throw new Error(`HTTP Error ${response.statusText}: ${await response.text()}`);
	} else {
		return await response.json();
	}
}

interface EvaluatePromptParams {
	messages: PromptMessage[];
	temperature?: number;
	max_tokens?: number;
	model_kind?: ModelKind;
}

export enum RequestMethod {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	PATCH = 'PATCH',
	DELETE = 'DELETE'
}

const defaultHeaders = {
	'Content-Type': 'application/json'
};

export class CloudClient {
	constructor(public fetch = window.fetch) {}

	private formatBody(body?: FormData | object) {
		if (body instanceof FormData) {
			return body;
		} else if (body) {
			return JSON.stringify(body);
		}
	}

	// TODO: consider renaming
	async makeRequest<T>(
		path: string,
		method: RequestMethod,
		body?: FormData | object,
		headers?: HeadersInit
	): Promise<T> {
		const response = await this.fetch(getUrl(path), {
			method,
			headers: { ...defaultHeaders, ...headers },
			body: this.formatBody(body)
		});

		return parseResponseJSON(response);
	}

	makeAuthenticatedRequest<T>(
		path: string,
		method: RequestMethod,
		token: string,
		body?: FormData | object,
		headers?: HeadersInit
	): Promise<T> {
		const authenticatedHeaders = {
			...headers,
			'X-Auth-Token': token
		};
		return this.makeRequest(path, method, body, authenticatedHeaders);
	}

	async createLoginToken(): Promise<LoginToken> {
		const response = await this.fetch(getUrl('login/token.json'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({})
		});
		const token = await parseResponseJSON(response);
		const url = new URL(token.url);
		url.host = apiUrl.host;
		return {
			...token,
			url: url.toString()
		};
	}

	async getLoginUser(token: string): Promise<User> {
		const response = await this.fetch(getUrl(`login/user/${token}.json`), {
			method: 'GET'
		});
		return parseResponseJSON(response);
	}

	async createFeedback(
		token: string | undefined,
		params: {
			email?: string;
			message: string;
			context?: string;
			logs?: Blob | File;
			data?: Blob | File;
			repo?: Blob | File;
		}
	): Promise<Feedback> {
		const formData = new FormData();
		formData.append('message', params.message);
		if (params.email) formData.append('email', params.email);
		if (params.context) formData.append('context', params.context);
		if (params.logs) formData.append('logs', params.logs);
		if (params.repo) formData.append('repo', params.repo);
		if (params.data) formData.append('data', params.data);
		const headers: HeadersInit = token ? { 'X-Auth-Token': token } : {};
		const response = await this.fetch(getUrl(`feedback`), {
			method: 'PUT',
			headers,
			body: formData
		});
		return parseResponseJSON(response);
	}

	async getUser(token: string): Promise<User> {
		const response = await this.fetch(getUrl(`user.json`), {
			method: 'GET',
			headers: {
				'X-Auth-Token': token
			}
		});
		return parseResponseJSON(response);
	}

	async updateUser(token: string, params: { name?: string; picture?: File }): Promise<any> {
		const formData = new FormData();
		if (params.name) {
			formData.append('name', params.name);
		}
		if (params.picture) {
			formData.append('avatar', params.picture);
		}
		const response = await this.fetch(getUrl(`user.json`), {
			method: 'PUT',
			headers: {
				'X-Auth-Token': token
			},
			body: formData
		});
		return parseResponseJSON(response);
	}

	async evaluateAIPrompt(
		token: string,
		params: EvaluatePromptParams
	): Promise<{ message: string }> {
		const response = await this.fetch(getUrl('evaluate_prompt/predict.json'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Auth-Token': token
			},
			body: JSON.stringify(params)
		});
		return parseResponseJSON(response);
	}

	async createProject(
		token: string,
		params: {
			name: string;
			description?: string;
			uid?: string;
		}
	): Promise<Project> {
		const response = await this.fetch(getUrl('projects.json'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Auth-Token': token
			},
			body: JSON.stringify(params)
		});
		return parseResponseJSON(response);
	}

	async updateProject(
		token: string,
		repositoryId: string,
		params: {
			name: string;
			description?: string;
		}
	): Promise<Project> {
		const response = await this.fetch(getUrl(`projects/${repositoryId}.json`), {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'X-Auth-Token': token
			},
			body: JSON.stringify(params)
		});
		return parseResponseJSON(response);
	}

	async listProjects(token: string): Promise<Project[]> {
		const response = await this.fetch(getUrl('projects.json'), {
			method: 'GET',
			headers: {
				'X-Auth-Token': token
			}
		});
		return parseResponseJSON(response);
	}

	async getProject(token: string, repositoryId: string): Promise<Project> {
		const response = await this.fetch(getUrl(`projects/${repositoryId}.json`), {
			method: 'GET',
			headers: {
				'X-Auth-Token': token
			}
		});
		return parseResponseJSON(response);
	}

	async deleteProject(token: string, repositoryId: string): Promise<void> {
		const response = await this.fetch(getUrl(`projects/${repositoryId}.json`), {
			method: 'DELETE',
			headers: {
				'X-Auth-Token': token
			}
		});
		return parseResponseJSON(response);
	}
}

export async function syncToCloud(projectId: string | undefined) {
	try {
		if (projectId) await invoke<void>('project_flush_and_push', { id: projectId });
	} catch (err: any) {
		console.error(err);
	}
}