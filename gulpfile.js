'use strict';

var browserify = require('browserify');
var gulp = require('gulp');
var transform = require('vinyl-transform');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var imagemin = require('gulp-imagemin');
var sourcemaps = require('gulp-sourcemaps');
var gutil = require('gulp-util');
var template = require('gulp-template');

var PRODUCTION = process.env.NODE_ENV == 'production';

// *************************************************************************************************

var buildPath = process.env.HOME + '/Dropbox/Builds/moya';
var host = 'dev.moyalang.com:8080';
var version = 'v0.0';

// *************************************************************************************************


gulp.task('scripts', function () {
var b = browserify({debug: true, entries: ['./lib/Moya.js']});
return b.bundle()
  .pipe(source('Moya.js'))
  .pipe(buffer())
  .pipe(sourcemaps.init({loadMaps: true}))
    .on('error', gutil.log)
  .pipe(sourcemaps.write('./'))
  .pipe(gulp.dest(buildPath));
});

gulp.task('styles', function () {
  return gulp.src('./static/moya.css')
    .pipe(gulp.dest(buildPath + '/static/'));
})

gulp.task('images', function() {
  return gulp.src('./static/*.{jpg,png}')
    .pipe(imagemin({optimizationLevel: 5}))
    .pipe(gulp.dest(buildPath + '/static/'));
});

gulp.task('html', function() {
  return gulp.src('./static/index.html')
    .pipe(template({
        version: version,
        host: host,
    }))
    .pipe(gulp.dest(buildPath))
    .pipe(rename(version + ".html"))
    .pipe(gulp.dest(buildPath));
  });

// *************************************************************************************************

var tasks = ['scripts', 'styles', 'images', 'html'];

gulp.task('watch', function() {
// XXXjoe Using watchify for scripts due to its superior performance
gulp.watch('./lib/**/*.js', { interval: 500 }, ['scripts']);
gulp.watch('./static/*.html', { interval: 1000 }, ['html']);
gulp.watch('./static/*.css', { interval: 1000 }, ['styles']);
gulp.watch('./static/*.{jpg,png,svg}', { interval: 1000 }, ['images']);
});
tasks.unshift('watch');

gulp.task('default', tasks);
