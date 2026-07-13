export namespace backend {
	
	export class AddRequest {
	    url: string;
	    filename?: string;
	    destinationPath?: string;
	    category?: string;
	    kind?: string;
	    referrer?: string;
	    userAgent?: string;
	    videoFormatId?: string;
	    browser?: string;
	    browserProfile?: string;
	    expectedSha256?: string;
	    queueId?: string;
	    priority?: number;
	    authScheme?: string;
	    authUsername?: string;
	    authSecret?: string;
	    rememberCredential?: boolean;
	    cookieHeader?: string;
	
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
	        this.referrer = source["referrer"];
	        this.userAgent = source["userAgent"];
	        this.videoFormatId = source["videoFormatId"];
	        this.browser = source["browser"];
	        this.browserProfile = source["browserProfile"];
	        this.expectedSha256 = source["expectedSha256"];
	        this.queueId = source["queueId"];
	        this.priority = source["priority"];
	        this.authScheme = source["authScheme"];
	        this.authUsername = source["authUsername"];
	        this.authSecret = source["authSecret"];
	        this.rememberCredential = source["rememberCredential"];
	        this.cookieHeader = source["cookieHeader"];
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
	    width?: number;
	    height?: number;
	    fps?: number;
	    videoCodec?: string;
	    audioCodec?: string;
	    audioBitrateKbps?: number;
	    hdr?: boolean;
	    compatibility?: string;
	    recommended?: boolean;
	
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
	        this.width = source["width"];
	        this.height = source["height"];
	        this.fps = source["fps"];
	        this.videoCodec = source["videoCodec"];
	        this.audioCodec = source["audioCodec"];
	        this.audioBitrateKbps = source["audioBitrateKbps"];
	        this.hdr = source["hdr"];
	        this.compatibility = source["compatibility"];
	        this.recommended = source["recommended"];
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
	    etag?: string;
	    lastModified?: string;
	    expectedSha256?: string;
	    actualSha256?: string;
	    httpVersion?: string;
	    dnsMillis?: number;
	    tlsMillis?: number;
	    ttfbMillis?: number;
	    reusedConnections?: number;
	    newConnections?: number;
	    state: string;
	    error?: string;
	    errorCategory?: string;
	    dateAdded: string;
	    dateCompleted?: string;
	    segments?: SegmentProgress[];
	    video?: VideoInfo;
	    torrent?: TorrentInfo;
	    referrer?: string;
	    requestUserAgent?: string;
	    videoFormatId?: string;
	    browserProfile?: string;
	    browser?: string;
	    queueId?: string;
	    priority?: number;
	    authScheme?: string;
	    authUsername?: string;
	    credentialTarget?: string;
	    processingStage?: string;
	
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
	        this.etag = source["etag"];
	        this.lastModified = source["lastModified"];
	        this.expectedSha256 = source["expectedSha256"];
	        this.actualSha256 = source["actualSha256"];
	        this.httpVersion = source["httpVersion"];
	        this.dnsMillis = source["dnsMillis"];
	        this.tlsMillis = source["tlsMillis"];
	        this.ttfbMillis = source["ttfbMillis"];
	        this.reusedConnections = source["reusedConnections"];
	        this.newConnections = source["newConnections"];
	        this.state = source["state"];
	        this.error = source["error"];
	        this.errorCategory = source["errorCategory"];
	        this.dateAdded = source["dateAdded"];
	        this.dateCompleted = source["dateCompleted"];
	        this.segments = this.convertValues(source["segments"], SegmentProgress);
	        this.video = this.convertValues(source["video"], VideoInfo);
	        this.torrent = this.convertValues(source["torrent"], TorrentInfo);
	        this.referrer = source["referrer"];
	        this.requestUserAgent = source["requestUserAgent"];
	        this.videoFormatId = source["videoFormatId"];
	        this.browserProfile = source["browserProfile"];
	        this.browser = source["browser"];
	        this.queueId = source["queueId"];
	        this.priority = source["priority"];
	        this.authScheme = source["authScheme"];
	        this.authUsername = source["authUsername"];
	        this.credentialTarget = source["credentialTarget"];
	        this.processingStage = source["processingStage"];
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
	export class HostRule {
	    host: string;
	    maxConnections: number;
	    forceSingleConnection: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HostRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.maxConnections = source["maxConnections"];
	        this.forceSingleConnection = source["forceSingleConnection"];
	    }
	}
	export class Schedule {
	    enabled: boolean;
	    startHHmm: string;
	    stopHHmm: string;
	    weekdays?: number[];
	    repeat?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Schedule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.startHHmm = source["startHHmm"];
	        this.stopHHmm = source["stopHHmm"];
	        this.weekdays = source["weekdays"];
	        this.repeat = source["repeat"];
	    }
	}
	export class Queue {
	    id: string;
	    name: string;
	    priority: number;
	    maxConcurrent: number;
	    running: boolean;
	    speedLimitBps?: number;
	    schedule?: Schedule;
	    completionAction?: string;
	
	    static createFrom(source: any = {}) {
	        return new Queue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.priority = source["priority"];
	        this.maxConcurrent = source["maxConcurrent"];
	        this.running = source["running"];
	        this.speedLimitBps = source["speedLimitBps"];
	        this.schedule = this.convertValues(source["schedule"], Schedule);
	        this.completionAction = source["completionAction"];
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
	
	
	export class Settings {
	    downloadDir: string;
	    maxConcurrent: number;
	    globalSpeedLimitBps?: number;
	    categories: Category[];
	    clipboardMonitoring: boolean;
	    notifyOnComplete: boolean;
	    shutdownOnComplete: boolean;
	    schedule?: Schedule;
	    segmentCount: number;
	    retryCount: number;
	    retryDelaySeconds: number;
	    requestTimeoutSeconds: number;
	    userAgent: string;
	    autoResumeOnStartup: boolean;
	    overwritePolicy: string;
	    removeCompleted: boolean;
	    showCompletionDialog: boolean;
	    temporaryDir: string;
	    captureFileTypes: string[];
	    excludedSites: string[];
	    videoDetectionEnabled: boolean;
	    disabledVideoSites: string[];
	    preferredVideoQuality: string;
	    preferredVideoContainer: string;
	    concurrentFragments: number;
	    cookieBrowser: string;
	    cookieProfile: string;
	    cookieConsent: boolean;
	    browserOnboardingCompleted: boolean;
	    showBrowserOnboardingOnStartup: boolean;
	    hostRules?: HostRule[];
	    useSystemProxy: boolean;
	    proxyUrl?: string;
	    queues?: Queue[];
	
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
	        this.segmentCount = source["segmentCount"];
	        this.retryCount = source["retryCount"];
	        this.retryDelaySeconds = source["retryDelaySeconds"];
	        this.requestTimeoutSeconds = source["requestTimeoutSeconds"];
	        this.userAgent = source["userAgent"];
	        this.autoResumeOnStartup = source["autoResumeOnStartup"];
	        this.overwritePolicy = source["overwritePolicy"];
	        this.removeCompleted = source["removeCompleted"];
	        this.showCompletionDialog = source["showCompletionDialog"];
	        this.temporaryDir = source["temporaryDir"];
	        this.captureFileTypes = source["captureFileTypes"];
	        this.excludedSites = source["excludedSites"];
	        this.videoDetectionEnabled = source["videoDetectionEnabled"];
	        this.disabledVideoSites = source["disabledVideoSites"];
	        this.preferredVideoQuality = source["preferredVideoQuality"];
	        this.preferredVideoContainer = source["preferredVideoContainer"];
	        this.concurrentFragments = source["concurrentFragments"];
	        this.cookieBrowser = source["cookieBrowser"];
	        this.cookieProfile = source["cookieProfile"];
	        this.cookieConsent = source["cookieConsent"];
	        this.browserOnboardingCompleted = source["browserOnboardingCompleted"];
	        this.showBrowserOnboardingOnStartup = source["showBrowserOnboardingOnStartup"];
	        this.hostRules = this.convertValues(source["hostRules"], HostRule);
	        this.useSystemProxy = source["useSystemProxy"];
	        this.proxyUrl = source["proxyUrl"];
	        this.queues = this.convertValues(source["queues"], Queue);
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
	export class ToolStatus {
	    name: string;
	    installed: boolean;
	    version?: string;
	    path?: string;
	    lastUpdated?: string;
	    managed: boolean;
	    rollbackAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ToolStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.path = source["path"];
	        this.lastUpdated = source["lastUpdated"];
	        this.managed = source["managed"];
	        this.rollbackAvailable = source["rollbackAvailable"];
	    }
	}
	
	export class UrlProbe {
	    filename: string;
	    sizeBytes?: number;
	    supportsResume: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UrlProbe(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.sizeBytes = source["sizeBytes"];
	        this.supportsResume = source["supportsResume"];
	    }
	}
	
	
	export class VideoToolsHealth {
	    ytDlp: ToolStatus;
	    ffmpeg: ToolStatus;
	    updaterConfigured: boolean;
	    diagnosticOk: boolean;
	    diagnosticMessage: string;
	
	    static createFrom(source: any = {}) {
	        return new VideoToolsHealth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ytDlp = this.convertValues(source["ytDlp"], ToolStatus);
	        this.ffmpeg = this.convertValues(source["ffmpeg"], ToolStatus);
	        this.updaterConfigured = source["updaterConfigured"];
	        this.diagnosticOk = source["diagnosticOk"];
	        this.diagnosticMessage = source["diagnosticMessage"];
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

export namespace license {
	
	export class Device {
	    deviceId: string;
	    name: string;
	    activatedAt: string;
	    lastSeenAt?: string;
	    current?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Device(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deviceId = source["deviceId"];
	        this.name = source["name"];
	        this.activatedAt = source["activatedAt"];
	        this.lastSeenAt = source["lastSeenAt"];
	        this.current = source["current"];
	    }
	}
	export class Policy {
	    tier: string;
	    maxActiveDownloads: number;
	    maxConnectionsPerDownload: number;
	    allowCustomQueues: boolean;
	    allowScheduling: boolean;
	    allowCompletionActions: boolean;
	    allowPerScopeBandwidth: boolean;
	    allowProxy: boolean;
	    allowHostProfiles: boolean;
	    allowStoredCredentials: boolean;
	    allowVideoFormatChoice: boolean;
	    allowConcurrentFragments: boolean;
	    maxVideoHeight: number;
	    maxDevices: number;
	
	    static createFrom(source: any = {}) {
	        return new Policy(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tier = source["tier"];
	        this.maxActiveDownloads = source["maxActiveDownloads"];
	        this.maxConnectionsPerDownload = source["maxConnectionsPerDownload"];
	        this.allowCustomQueues = source["allowCustomQueues"];
	        this.allowScheduling = source["allowScheduling"];
	        this.allowCompletionActions = source["allowCompletionActions"];
	        this.allowPerScopeBandwidth = source["allowPerScopeBandwidth"];
	        this.allowProxy = source["allowProxy"];
	        this.allowHostProfiles = source["allowHostProfiles"];
	        this.allowStoredCredentials = source["allowStoredCredentials"];
	        this.allowVideoFormatChoice = source["allowVideoFormatChoice"];
	        this.allowConcurrentFragments = source["allowConcurrentFragments"];
	        this.maxVideoHeight = source["maxVideoHeight"];
	        this.maxDevices = source["maxDevices"];
	    }
	}
	export class Status {
	    tier: string;
	    health: string;
	    licensed: boolean;
	    licenseId?: string;
	    product?: string;
	    edition?: string;
	    versionScope?: string;
	    deviceId: string;
	    deviceName: string;
	    deviceLimit?: number;
	    issuedAt?: string;
	    refreshBy?: string;
	    policy: Policy;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tier = source["tier"];
	        this.health = source["health"];
	        this.licensed = source["licensed"];
	        this.licenseId = source["licenseId"];
	        this.product = source["product"];
	        this.edition = source["edition"];
	        this.versionScope = source["versionScope"];
	        this.deviceId = source["deviceId"];
	        this.deviceName = source["deviceName"];
	        this.deviceLimit = source["deviceLimit"];
	        this.issuedAt = source["issuedAt"];
	        this.refreshBy = source["refreshBy"];
	        this.policy = this.convertValues(source["policy"], Policy);
	        this.message = source["message"];
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
	export class BrowserInfo {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new BrowserInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class BrowserIntegrationInfo {
	    extensionDir: string;
	    extensionId: string;
	    connected: boolean;
	    browsers: BrowserInfo[];
	
	    static createFrom(source: any = {}) {
	        return new BrowserIntegrationInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.extensionDir = source["extensionDir"];
	        this.extensionId = source["extensionId"];
	        this.connected = source["connected"];
	        this.browsers = this.convertValues(source["browsers"], BrowserInfo);
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

