import {join,resolve} from 'node:path';
import {homedir} from 'node:os';

/** Shared by every installation under the same OS account, independent of checkout and host. */
export function sharedHome(env:NodeJS.ProcessEnv=process.env,platform=process.platform,home=homedir()){
  return resolve(env.GALGAME_HOME||(platform==='win32'?join(env.LOCALAPPDATA||home,'DontBuildAnApp'):platform==='darwin'?join(home,'Library','Application Support','DontBuildAnApp'):join(env.XDG_DATA_HOME||join(home,'.local','share'),'dont-build-an-app')));
}
