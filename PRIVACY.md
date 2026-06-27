# SwitchAccounts 隐私说明

SwitchAccounts 的设计目标是本地账号状态切换，不提供云端服务。

## 收集和存储的数据

扩展会在用户明确操作时读取并保存：

- 当前注册域及全部子域的 Cookie。
- 当前页面 origin 的 `localStorage`。
- 当前页面 origin 的 `sessionStorage`。
- 用户为账号配置填写的名称。

这些数据保存在浏览器本机的 `chrome.storage.local`。

## 不会做的事情

- 不上传账号配置。
- 不上传 Cookie 或 Web Storage。
- 不使用遥测。
- 不使用远程账户系统。
- 不使用 Chrome 同步存储。
- 不自动识别或分析当前账号身份。

## 导入和导出

导出文件是明文 JSON，可能包含可直接使用的登录凭证。用户应自行负责导出文件的保存、传输和删除。

## 删除数据

用户可以在管理页删除单个账号配置，也可以通过 Chrome 扩展管理页清除扩展数据。
