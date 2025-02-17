declare module 'shorturl' {
  function shorturl(url: string, provider?: string, callback?: (err: Error | null, shortUrl: string) => void): Promise<string>;
  export = shorturl;
}
