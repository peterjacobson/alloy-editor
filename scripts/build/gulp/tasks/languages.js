'use strict';

const Constants = require('../constants');
const fs = require('fs');
const gulp = require('gulp');
const hashFiles = require('hash-files');
const path = require('path');
const walk = require('walk');

const hashSources = [
	path.join(Constants.rootDir, 'lib', 'lang/*.js'),
	Constants.ckeditorLangKeys,
	path.join(Constants.langDir + '/*.json')
];

const hashFile = path.join('./', '_hash');

/**
 * Normalizes the different string values that can be stored in a language template.
 * @param  {String} value The stored value
 * @param  {String} lang  The language in which we want the value to be resolved
 * @return {String} The normalized string
 */
const getStringLangValue = function(value, lang) {
	if (value.indexOf('.') !== -1) {
		value = 'CKEDITOR.lang["' + lang + '"].' + value.replace(/"/g, '');
	}

	// Value can be at this point a string 'value' or a reference to a CKEDITOR lang property
	// 'CKEDITOR.lang['en'].table'. Eval will, in both cases, resolve the proper value.
	return eval(value);
};

function updateLangFiles(callback) {
	// Mock the CKEDITOR.lang object to walk the ckeditor js lang files
	global.CKEDITOR = {
		lang: {}
	};

	// Mock AlloyEditor
	global.AlloyEditor = {
		Strings: {}
	};

	const langWalker = walk.walk(Constants.srcLangDir);
	langWalker.on('end', () => callback());

	const defaultTranslations = require(path.join(
		Constants.langDir,
		'en.json'
	));

	// Iterate over every existing lang file inside src/lang
	langWalker.on('file', (root, fileStats, next) => {
		const lang = path.basename(fileStats.name, '.js');

		// Load the matching CKEDITOR lang file with all the strings
		require(path.join(Constants.rootDir, 'lib', 'lang', fileStats.name));

		Object.keys(Constants.ckeditorLangContent).forEach(key => {
			AlloyEditor.Strings[key] = getStringLangValue(
				Constants.ckeditorLangContent[key],
				lang
			);
		});

		// Try to load translations for "lang"
		let translations;
		try {
			translations = require(path.join(
				Constants.langDir,
				lang + '.json'
			));
		} catch (err) {
			console.log('translations not found for:', lang);
		}

		if (translations) {
			Object.keys(defaultTranslations).forEach(key => {
				AlloyEditor.Strings[key] = defaultTranslations[key];
			});

			Object.keys(translations).forEach(key => {
				AlloyEditor.Strings[key] = translations[key];
			});
		}

		// Update the contents of the current lang file
		fs.writeFile(
			path.join(Constants.rootDir, 'src', 'lang', fileStats.name),
			'AlloyEditor.Strings = ' +
				JSON.stringify(AlloyEditor.Strings) +
				';',
			err => {
				if (err) {
					return callback(err);
				}
				next();
			}
		);
	});
}

function createHash(callback) {
	hashFiles({files: hashSources}, (err, hash) => {
		if (err) {
			return callback(err);
		}

		fs.writeFile(hashFile, hash, err => {
			if (err) {
				return callback(err);
			}
			callback();
		});
	});
}

function compareHash(originalHash, callback) {
	hashFiles({files: hashSources}, (err, hash) => {
		if (err) {
			return callback(err);
		}

		const changed = originalHash !== hash;
		callback(changed);
	});
}

function buildLanguages(callback) {
	fs.exists(hashFile, exists => {
		if (!exists) {
			updateLangFiles(() => createHash(callback));
		} else {
			fs.readFile(hashFile, (err, data) => {
				if (err) {
					return callback(err);
				}

				compareHash(data.toString(), changed => {
					if (changed) {
						updateLangFiles(() => createHash(callback));
					} else {
						callback();
					}
				});
			});
		}
	});
}

function copyLanguages() {
	return gulp
		.src(path.join(Constants.rootDir, 'src', 'lang', '/**'))
		.pipe(
			gulp.dest(
				path.join(Constants.editorDistFolder, 'lang', 'alloy-editor')
			)
		);
}

gulp.task('languages:copy', gulp.series(buildLanguages, copyLanguages));
