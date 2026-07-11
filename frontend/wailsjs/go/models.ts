export namespace backend {
	
	export class AddRequest {
	    url: string;
	    filename?: string;
	    destinationPath?: string;
	    category?: string;
	    kind?: string;
	
	    static createFrom(source: any = {}) {
	        return new AddRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.destinationPath = source["destinationPath"];
	        this.category = source["category"];
	        this.kind = source["kind"];
	    }
	}
	export class Category {
	    id: string;
	    name: string;
	    folder: string;
	    extensions: string[];
	
	    static createFrom(source: any = {}) {
	        return new Category(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.folder = source["folder"];
	        this.extensions = source["extensions"];
	    }
	}
	export class TorrentInfo {
	    peers: number;
	    seeders: number;
	    ratio: number;
	
	    static createFrom(source: any = {}) {
	        return new TorrentInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.peers = source["peers"];
	        this.seeders = source["seeders"];
	        this.ratio = source["ratio"];
	    }
	}
	export class VideoFormat {
	    id: string;
	    label: string;
	    ext: string;
	    sizeBytes?: number;
	    hasVideo: boolean;
	    hasAudio: boolean;
	
	    static createFrom(source: any = {}) {
	        return new VideoFormat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.ext = source["ext"];
	        this.sizeBytes = source["sizeBytes"];
	        this.hasVideo = source["hasVideo"];
	        this.hasAudio = source["hasAudio"];
	    }
	}
	export class VideoInfo {
	    title?: string;
	    formats: VideoFormat[];
	    selectedFormatId?: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.formats = this.convertValues(source["formats"], VideoFormat);
	        this.selectedFormatId = source["selectedFormatId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SegmentProgress {
	    index: number;
	    from: number;
	    to: number;
	    done: number;
	
	    static createFrom(source: any = {}) {
	        return new SegmentProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.done = source["done"];
	    }
	}
	export class Download {
	    id: string;
	    url: string;
	    filename: string;
	    destinationPath: string;
	    category: string;
	    kind: string;
	    sizeBytes?: number;
	    downloadedBytes: number;
	    progressPct: number;
	    speedBps: number;
	    etaSeconds?: number;
	    supportsResume: boolean;
	    state: string;
	    error?: string;
	    dateAdded: string;
	    dateCompleted?: string;
	    segments?: SegmentProgress[];
	    video?: VideoInfo;
	    torrent?: TorrentInfo;
	
	    static createFrom(source: any = {}) {
	        return new Download(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.filename = source["filename"];
	        this.destinationPath = source["destinationPath"];
	        this.category = source["category"];
	        this.kind = source["kind"];
	        this.sizeBytes = source["sizeBytes"];
	        this.downloadedBytes = source["downloadedBytes"];
	        this.progressPct = source["progressPct"];
	        this.speedBps = source["speedBps"];
	        this.etaSeconds = source["etaSeconds"];
	        this.supportsResume = source["supportsResume"];
	        this.state = source["state"];
	        this.error = source["error"];
	        this.dateAdded = source["dateAdded"];
	        this.dateCompleted = source["dateCompleted"];
	        this.segments = this.convertValues(source["segments"], SegmentProgress);
	        this.video = this.convertValues(source["video"], VideoInfo);
	        this.torrent = this.convertValues(source["torrent"], TorrentInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Schedule {
	    enabled: boolean;
	    startHHmm: string;
	    stopHHmm: string;
	
	    static createFrom(source: any = {}) {
	        return new Schedule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.startHHmm = source["startHHmm"];
	        this.stopHHmm = source["stopHHmm"];
	    }
	}
	
	export class Settings {
	    downloadDir: string;
	    maxConcurrent: number;
	    globalSpeedLimitBps?: number;
	    categories: Category[];
	    clipboardMonitoring: boolean;
	    notifyOnComplete: boolean;
	    shutdownOnComplete: boolean;
	    schedule?: Schedule;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.downloadDir = source["downloadDir"];
	        this.maxConcurrent = source["maxConcurrent"];
	        this.globalSpeedLimitBps = source["globalSpeedLimitBps"];
	        this.categories = this.convertValues(source["categories"], Category);
	        this.clipboardMonitoring = source["clipboardMonitoring"];
	        this.notifyOnComplete = source["notifyOnComplete"];
	        this.shutdownOnComplete = source["shutdownOnComplete"];
	        this.schedule = this.convertValues(source["schedule"], Schedule);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace main {
	
	export class AccentPalette {
	    accent: string;
	    light1: string;
	    light2: string;
	    light3: string;
	    dark1: string;
	    dark2: string;
	    dark3: string;
	
	    static createFrom(source: any = {}) {
	        return new AccentPalette(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.accent = source["accent"];
	        this.light1 = source["light1"];
	        this.light2 = source["light2"];
	        this.light3 = source["light3"];
	        this.dark1 = source["dark1"];
	        this.dark2 = source["dark2"];
	        this.dark3 = source["dark3"];
	    }
	}

}

