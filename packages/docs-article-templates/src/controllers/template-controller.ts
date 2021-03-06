/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

import { showStatusMessage, sendTelemetryData, postError } from '../helper/common';
import { files } from 'node-dir';
import {
	addUnitToQuickPick,
	displayTemplateList,
	moduleQuickPick,
	newModuleMessage,
	newUnitMessage
} from '../strings';
import { getUnitName, showLearnFolderSelector } from '../helper/unit-module-builder';
import { basename, dirname, extname, join, parse } from 'path';
import { readFileSync } from 'fs';
import { QuickPickItem, QuickPickOptions, window, workspace } from 'vscode';
import { applyDocsTemplate } from '../controllers/quick-pick-controller';
import { cleanupDownloadFiles } from '../helper/cleanup';
import { templateRepo } from '../helper/user-settings';

const telemetryCommand: string = 'templateSelected';
let commandOption: string;
export let moduleTitle;
const markdownExtensionFilter = ['.md'];

export function applyTemplateCommand() {
	const commands = [{ command: applyTemplate.name, callback: applyTemplate }];
	return commands;
}

export async function applyTemplate() {
	// clean up template directory and download copy of the template repo.
	cleanupDownloadFiles(true).then(() => downloadRepo());
}

export async function displayTemplates() {
	showStatusMessage(displayTemplateList);

	files(localTemplateRepoPath, (err, files) => {
		if (err) {
			showStatusMessage(err);
			throw err;
		}

		// data structure used to store file name and path info for quick pick and template source.
		const quickPickMap = new Map();

		{
			files
				.filter((file: any) => markdownExtensionFilter.indexOf(extname(file.toLowerCase())) !== -1)
				.forEach((file: any) => {
					if (basename(file).toLowerCase() !== 'readme.md') {
						quickPickMap.set(basename(file), join(dirname(file), basename(file)));
					}
				});
		}

		let data: any;
		try {
			const templateMappingJson = join(
				localTemplateRepoPath,
				'content-templates-template-updates',
				'template-mapping',
				'template-mapping.json'
			);
			const templatesJson = readFileSync(templateMappingJson, 'utf8');
			data = JSON.parse(templatesJson);
		} catch (error) {
			postError(`${error.name} ${error.message}`);
			showStatusMessage(`${error.name} ${error.message}`);
			return;
		}

		// push quickMap keys to QuickPickItems
		const templates: QuickPickItem[] = [];
		templates.push({ label: moduleQuickPick });
		const activeFilePath = window.activeTextEditor.document.fileName;
		const activeFile = parse(activeFilePath).base;
		let repo;
		if (activeFile === 'index.yml') {
			templates.push({ label: addUnitToQuickPick });
		}
		if (workspace.workspaceFolders) {
			repo = workspace.workspaceFolders[0].name;
		}

		for (const key of quickPickMap.keys()) {
			try {
				data.templates.forEach((obj: any) => {
					const template = basename(obj.templateFileName);
					const friendlyName = obj.templateFriendlyName;
					const templatePath = quickPickMap.get(key);
					if (template === basename(templatePath)) {
						obj.repos.forEach((obj: any) => {
							if (obj === repo || obj === '*') {
								if (friendlyName) {
									templates.push({ label: friendlyName, description: key });
								} else {
									templates.push({ label: key });
								}
							}
						});
					}
				});
			} catch (error) {
				postError(`${error.name} ${error.message}`);
				showStatusMessage(`${error.name} ${error.message}`);
			}
		}

		templates.sort(function (a, b) {
			const firstLabel = a.label.toUpperCase();
			const secondLabel = b.label.toUpperCase();
			if (firstLabel < secondLabel) {
				return -1;
			}
			if (firstLabel > secondLabel) {
				return 1;
			}
			return 0;
		});

		const options: QuickPickOptions = {
			matchOnDescription: false
		};

		window.showQuickPick(templates, options).then(
			qpSelection => {
				if (!qpSelection) {
					return;
				}

				if (qpSelection.label === moduleQuickPick) {
					showLearnFolderSelector();
					commandOption = 'new-module';
					showStatusMessage(newModuleMessage);
				}

				if (qpSelection.label === addUnitToQuickPick) {
					getUnitName(true, activeFilePath);
					commandOption = 'additional-unit';
					showStatusMessage(newUnitMessage);
				}

				if (
					qpSelection.label &&
					qpSelection.label !== moduleQuickPick &&
					qpSelection.label !== addUnitToQuickPick
				) {
					let template: string;
					if (qpSelection.description) {
						template = qpSelection.description;
					} else {
						template = qpSelection.label;
					}
					const templatePath = quickPickMap.get(template);

					applyDocsTemplate(templatePath);
					commandOption = template;
					showStatusMessage(`Applying ${template} template.`);
				}
				sendTelemetryData(telemetryCommand, commandOption);
			},
			(error: any) => {
				showStatusMessage(error);
			}
		);
	});
}
export let localTemplateRepoPath: string;
let templateZip: string;

// download a copy of the template repo to the "docs authoring" directory.  no .git-related files will be generated by this process.
export async function downloadRepo() {
	const download = require('download');
	const tmp = require('tmp');
	localTemplateRepoPath = tmp.dirSync({ unsafeCleanup: true }).name;
	showStatusMessage(`Temp working directory ${localTemplateRepoPath} has been created.`);
	try {
		await download(templateRepo, localTemplateRepoPath);
		templateZip = join(localTemplateRepoPath, 'template-updates.zip');
	} catch (error) {
		postError(error);
		showStatusMessage(error);
	}
	unzipTemplates();
}

async function unzipTemplates() {
	const extract = require('extract-zip');
	try {
		await extract(templateZip, { dir: localTemplateRepoPath });
		displayTemplates();
	} catch (error) {
		postError(error);
		showStatusMessage(error);
	}
}
