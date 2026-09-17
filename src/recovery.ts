/** One explicit user submission, with a format reminder; never an automatic model request. */
export function recoveryMessage(text:string,paths:{runtime:string;reference:string;publisher:string}){
  return `${text}\n\n【GalGame 网页续接说明】\n用户已在网页选择继续本次原对话。这条回复附带格式恢复提醒，不是新会话，也不要求重演之前的台词。\n请先读取网页模式约定：${paths.reference}\n运行实例：${paths.runtime}\n可执行 node ${JSON.stringify(paths.publisher)} ${JSON.stringify(paths.runtime)} --context 读取当前状态。\n按上面的用户回答和原对话最新决定继续；已修改的目标以最新决定为准，不替用户补答案或提前过关。使用新的 turn_id 暂存下一段剧情，再把工具返回的 finalText 原样作为本轮最终回复；不能只写在思考、commentary 或工具输出里。不需要用户重复做同步测试。`;
}
export type RecoverySubmission={text:string;gameSessionId:string;replyTo:string;wireText:string};
