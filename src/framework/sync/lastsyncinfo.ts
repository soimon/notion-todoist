export type LastSyncInfo =
	| {
			readonly token: string;
			readonly date: Date;
	  }
	| 'no-last-sync';

export type LastSyncInfoStore = {
	getLastSyncInfo(): Promise<LastSyncInfo>;
	setLastSyncInfo(token: string): Promise<void>;
};
