export const isDefined = <T>(v: T): v is Exclude<typeof v, undefined> =>
	v !== undefined;
