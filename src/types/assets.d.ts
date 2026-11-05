// Bundled images: Metro turns `import x from "./a.png"` into an asset id that
// expo-image and <Image> accept as a source.
declare module '*.png' {
  const asset: number;
  export default asset;
}
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
