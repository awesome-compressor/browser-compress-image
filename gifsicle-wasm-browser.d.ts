declare module 'gifsicle-wasm-browser' {
  const gifsicle: {
    run(options: {
      input: Array<{ file: File; name: string }>
      command: string[]
    }): Promise<Blob[]>
  }

  export default gifsicle
}
