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
        
    
# 1. 确保宿主机上已创建挂载文件
touch /home/ubuntu/dns-data/upstreams.json

# 2. 拉取并运行您在 GitHub 构建的镜像
docker run -d \
  -p 7860:7860 \
  -v /home/upstreams.json:/usr/src/app/upstreams.json \
  --name dns-bridge \
  --restart unless-stopped \
  ghcr.io/您的github用户名/您的仓库名:latest
