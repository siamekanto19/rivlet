export function isTakeoverURL(value:string):boolean{return /^https?:\/\//i.test(value)}
export function serializeCookies(cookies:Array<{name:string;value:string}>):string{return cookies.map(cookie=>`${cookie.name}=${cookie.value}`).join('; ')}
