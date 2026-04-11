module.exports = function (options) {
  // Remove fork-ts-checker-webpack-plugin to avoid type errors from
  // viem's ox dependency which ships raw .ts files
  if (options.plugins) {
    options.plugins = options.plugins.filter(
      (plugin) => plugin.constructor.name !== 'ForkTsCheckerWebpackPlugin',
    );
  }
  return options;
};
