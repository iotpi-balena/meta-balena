/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

module.exports = {
	title: 'fsck.ext4 tests',
	tests: [
		{
			title: 'ext4 filesystems are checked on boot',
			run: async function(test) {
				async function markDirty(context, label) {
					await context.get()
						.worker.executeCommandInHostOS(
							['tune2fs', '-E', 'force_fsck',
								`/dev/disk/by-label/${label}`
							].join(' '),
							context.get().link
						);
				}

				async function getFilesystemState(context, label) {
					return await context.get()
						.worker.executeCommandInHostOS(
							['tune2fs', '-l', `/dev/disk/by-label/${label}`,
								'|', 'grep', '"Filesystem state"',
								'|', 'cut', '-d:', '-f2',
								'|', 'xargs'
							].join(' '),
							context.get().link
						);
				}

				// Exclude the boot partition for now, as it doesn't have metadata to
				// track when it was last checked, nor can we check the dirty bit while
				// it's mounted
				let diskLabels = [
					'resin-rootA',
					'resin-rootB',
					'resin-state',
					'resin-data',
				];

				for (const label of diskLabels) {
					await markDirty(this.context, label);
					let state = await getFilesystemState(this.context, label);
					let expectedState = 'clean with errors';
					test.is(
						state,
						expectedState,
						`Filesystem state for ${label} should be '${expectedState}'`
					)
				}

				test.comment('Filesystems have been marked dirty');
				await this.context.get().worker.rebootDut(this.context.get().link);

				for (const label of diskLabels) {
					let state = await getFilesystemState(this.context, label);
					let expectedState = 'clean';
					test.is(
						state,
						expectedState,
						`Filesystem state for ${label} should be '${expectedState}'`
					);
				}
			}
		}
	]
};
