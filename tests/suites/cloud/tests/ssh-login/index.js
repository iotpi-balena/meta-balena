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

const exec = require('bluebird').promisify(require('child_process').exec);
const balena_ssh_cmd = async(cmd, uuid) => {
	// TODO: Add retries as proxy could timeout
	const result = await exec(`echo "${cmd}; exit;" | balena ssh ${uuid} | tail -1`);
	console.log(`result ##${result}##`)
	return result
}

module.exports = {
	title: 'SSH login test',
	tests: [
		{
			title: 'SSH login in production images',
			run: async function(test) {
				const uuid = await this.context.get().balena.uuid
				await this.context
					.get()
					.cloud.balena.auth.loginWithToken(this.suite.options.balena.apiKey);
				test.comment(`Removing os.sshKeys`)
				await this.context
					.get()
					.cloud.executeCommandInHostOS(
						'tmp=$(mktemp)&&cat /mnt/boot/config.json | jq \'del(.os.sshKeys)\' > $tmp&&mv "$tmp" /mnt/boot/config.json',
						`${uuid}`,
					)
				/* Without os.sshKeys executeCommandInHostOS does not work as uses cached authentication via process.env.SSH_AUTH_SOCK */
				test.comment(`TEST1`)
				test.is(
					balena_ssh_cmd("echo -n pass", uuid),
					"pass",
					"TEST should echo pass"
				);
				test.comment(`TEST`)
				test.is(
					balena_ssh_cmd("echo -n pass", uuid),
					"pass",
					"TEST should echo pass"
				);
				test.comment(`Verify no os.sshKeys are present`)
				test.is(
					balena_ssh_cmd("grep sshKeys /mnt/boot/config.json || echo -n pass", uuid),
					"pass",
					"No os.sshKeys should be present"
				);
				test.comment(`Setting system in production mode...`)
				balena_ssh_cmd('tmp=$(mktemp)&&cat /mnt/boot/config.json | jq \'.developmentMode="false"\' > $tmp&&mv "$tmp" /mnt/boot/config.json', uuid)
				test.comment(`Waiting for engine to restart...`)
				await this.context.get().utils.waitUntil(async () => {
					return balena_ssh_cmd("systemctl is-active balena.service", uuid)
				}, false);
				test.comment(`Verify local SSH login is not allowed`)
				test.isNot(
					await exec(`ssh -p 22222 -o StrictHostKeyChecking=no root@${ip} echo -n "pass"`),
					"pass",
					"Local SSH login should not be allowed in production images",
				);
				test.comment(`Verify cloud SSH login is allowed`)
				test.is(
					balena_ssh_cmd("echo -n pass", uuid),
					"pass",
					"Local SSH login should not be allowed in production images",
				);
			},
		},
		{
			title: 'Passwordless SSH login in development images',
			run: async function(test) {
				const uuid = await this.context.get().balena.uuid
				const exec = require('bluebird').promisify(require('child_process').exec);
				test.comment(`Setting system in development mode...`)
				balena_ssh_cmd('tmp=$(mktemp)&&cat /mnt/boot/config.json | jq \'.developmentMode="true"\' > $tmp&&mv "$tmp" /mnt/boot/config.json', uuid)
				test.comment(`Waiting for engine to restart...`)
				await this.context.get().utils.waitUntil(async () => {
					return balena_ssh_cmd("systemctl is-active balena.service", uuid)
				}, false);
				test.comment(`Verify no os.sshKeys are present`)
				test.is(
					balena_ssh_cmd("grep sshKeys /mnt/boot/config.json || echo -n pass", uuid),
					"pass",
					"No os.sshKeys should be present"
				);
				test.comment(`Verify local passwordless SSH login is allowed`)
				test.is(
					await exec(`ssh -p 22222 -o StrictHostKeyChecking=no root@${ip} echo -n "pass"`),
					"pass",
					"Local passwordless SSH login should be allowed in development images",
				);
			},
		},
		{
			title: 'Key-based SSH login in development images',
			run: async function(test) {
				const uuid = await this.context.get().balena.uuid
				const exec = require('bluebird').promisify(require('child_process').exec);
				test.comment(`Setting system in development mode...`)
				balena_ssh_cmd('tmp=$(mktemp)&&cat /mnt/boot/config.json | jq \'.developmentMode="true"\' > $tmp&&mv "$tmp" /mnt/boot/config.json', uuid)
				test.comment(`Waiting for engine to restart...`)
				await this.context.get().utils.waitUntil(async () => {
					return balena_ssh_cmd("systemctl is-active balena.service", uuid)
				}, false);
				test.comment(`Verify no os.sshKeys are present`)
				test.is(
					balena_ssh_cmd("grep sshKeys /mnt/boot/config.json || echo -n pass", uuid),
					"pass",
					"No os.sshKeys should be present"
				);
				test.comment(`Adding phony os.sshKeys`)
				const phony_key = "thisisnotavalidkey"
				balena_ssh_cmd(`tmp=$(mktemp)&& jq --arg keys "${phony_key}" '. + {os: {sshKeys: [$keys]}}' "/mnt/boot/config.json" > $tmp&&mv "$tmp" /mnt/boot/config.json`, uuid)
				test.comment(`Verify os.sshKeys are present`)
				test.isNot(
					balena_ssh_cmd("grep sshKeys /mnt/boot/config.json || echo -n pass", uuid),
					"pass",
					"os.sshKeys should be present"
				);
				test.comment(`Verify local passwordless SSH login is not allowed`)
				test.isNot(
					await exec(`ssh -p 22222 -o StrictHostKeyChecking=no root@${ip} echo -n "pass"`),
					"pass",
					"Local passwordless SSH login should not be allowed in development images with configured sshKeys",
				);
				test.comment(`Adding os.sshKeys`)
				const fs = require('fs')
				const public_key = fs.readFileSync(this.context.get().sshKeyPath, 'utf8')
				balena_ssh_cmd(`tmp=$(mktemp)&& jq 'del(.os.sshKeys)' "/mnt/boot/config.json" | jq --arg keys "${public_key}" \'. + {os: {sshKeys: [$keys]}}\' "/mnt/boot/config.json" > $tmp&&mv "$tmp" /mnt/boot/config.json`, uuid)
				test.comment(`Verify local passwordless SSH login is not allowed`)
				test.isNot(
					await exec(`ssh -p 22222 -o StrictHostKeyChecking=no root@${ip} echo -n "pass"`),
					"pass",
					"Local passwordless SSH login should not be allowed in development images with configured sshKeys",
				);
				test.comment(`Verify local key-based SSH login is allowed`)
				const user = await this.balena.auth.whoami();
				test.is(
					await exec(`ssh -p 22222 -o StrictHostKeyChecking=no ${user}@${ip} echo -n "pass"`),
					"pass",
					"Local key-based SSH login should be allowed in development images with configured sshKeys",
				);
			},
		},
	],
};
