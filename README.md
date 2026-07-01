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
        
    
用变量形式保存上游服务器地址：
打开您的 Hugging Face Space 页面。
点击顶部的 Settings（设置）选项卡。
向下滚动到 Variables and secrets（变量与凭据）区域。
您会看到两个选项：
New secret（推荐）：用于保存敏感信息（如服务器密码、Token、私密 IP）。添加后内容会被加密，外部无法查看。
New variable：用于保存非敏感信息（如公共 API 地址、版本号）。添加后公开可见。
示例：
添加一个名为 UPSTREAM_SERVER_URL 的 Secret，Value 填写您的上游服务器地址（例如 https://your-upstream-server.com 或 http://1.2.3.4:8080）。
