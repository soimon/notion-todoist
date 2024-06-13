export const makeIsoScheduledString = (date: Date, withTime: boolean) =>
	withTime ? date.toISOString() : date.toISOString().split('T')[0]!;
