module.exports = {
  mount: {
    'src/polyrom': '/',
  },
  plugins: [
    '@snowpack/plugin-typescript',
  ],
  install: [ ],
  installOptions: { },
  devOptions: {
    port: 3000
  },
  buildOptions: {
    out: 'dist',
    clean: true,
  },
  proxy: { },
  alias: {
  },
  // experiments: {
  //   optimize: {
  //     entrypoints: [
  //       'src/example/index.ts',
  //       'src/nes/index.ts'
  //     ],
  //     bundle: true,
  //     minify: true,
  //     target: 'es2018'
  //   }
  // }
};
