module.exports = {
  plugins: [
    // 自动添加浏览器前缀
    require('autoprefixer'),

    // 使用现代 CSS 特性并自动回退
    require('postcss-preset-env')({
      stage: 2, // 使用稳定的 CSS 特性
      features: {
        'nesting-rules': true,
        'custom-properties': true,
        'media-query-ranges': true,
        'color-mod-function': { unresolved: 'warn' },
      },
      autoprefixer: false, // 避免重复，已经使用了 autoprefixer
    }),
  ],
}
