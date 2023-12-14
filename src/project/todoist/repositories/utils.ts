import {TodoistRequestError} from '@doist/todoist-api-typescript';

// Wrap a promise in a 404 check
export function with404Check<T>(
	promise: Promise<T>
): Promise<{wasFound: true; result: T} | {wasFound: false; result: undefined}> {
	return promise
		.then(
			result =>
				({
					wasFound: true,
					result,
				}) as const
		)
		.catch(e => {
			if (
				e instanceof TodoistRequestError &&
				!e.isAuthenticationError() &&
				e.httpStatusCode === 404
			)
				return {wasFound: false, result: undefined} as const;
			else {
				throw e;
			}
		});
}
