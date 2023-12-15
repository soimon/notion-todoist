export const makeIsoScheduledString = (
	date: Date | undefined,
	withTime: boolean
) =>
	withTime
		? // eslint-disable-next-line @typescript-eslint/no-explicit-any
		  (date?.toISOString() as any)
		: // eslint-disable-next-line @typescript-eslint/no-explicit-any
		  (date?.toISOString().split('T')[0] as any);
