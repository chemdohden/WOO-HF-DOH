# DoH服务器，不支持传统DNS-53查询



#### 部署到 Hugging Face Spaces

-   打开 [Hugging Face](https://www.google.com/url?sa=E&q=https%3A%2F%2Fhuggingface.co%2F) 并登录您的账号。
    
-   点击右上角头像，选择 **New Space** 创建新空间。
    
-   填写基本配置：
    
    -   **Space name**: 您的项目名称（例如 my-dns-doh）。
        
    -   **License**: 可以任意选择（例如 mit）。
        
    -   **SDK**: 必须选择 **Docker**。
        
    -   **Template**: 选择 **Blank**（不使用预设模板）。
        
    -   **Space hardware**: 默认的 **Cpu basic (Free)** 即可满足性能要求。
        
    -   **Visibility**: 如果需要公开提供解析，建议设置为 **Public**。
        
    
-   创建完成后，进入仓库（Files and versions）页面。
    
-   点击 **Add file** → **Upload files**，将 server.js、package.json 和 Dockerfile 这三个文件上传并提交（Commit）。
    
-   上传后，系统会自动开始构建（Building → Running）。
    

当右上角状态变为绿色的 **Running** 时，说明您的多协议 DNS 桥接服务器已在 Hugging Face 上成功启动。您可以通过类似下方的专属地址配置到支持 DoH 的终端中使用了：

-  使用：

```
https://您的用户名-您的Space名称.hf.space/dns-query
```



浏览器直接访问部署的面板，例如 `https://您的用户名-空间名.hf.space/`，就可以打开控制面板。
