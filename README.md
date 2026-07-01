# DoH服务器，不支持传统DNS-53查询




## Dockerfile 部署项目到 Hugging Face Spaces：

如果您的镜像已经托管在 GitHub Container Registry (GHCR) 上，且该**镜像设为公开（Public）**，您可以在 Hugging Face 上创建一个 Docker Space，直接拉取该镜像运行。

#### 1\. 准备工作

确保您的 Docker 镜像：

-   内部服务监听的端口为 7860（Hugging Face 强制要求绑定的端口）。
    
-   如果不是 7860，请在您的 Dockerfile 中修改，或者在运行时通过环境变量传入端口。
    

#### 2\. 在 Hugging Face 上创建 Space

-   登录 Hugging Face，点击 **New Space**。
    
-   输入 Space 名称，SDK 选择 **Docker**。
    
-   模板选择 **Blank**（空白）。
    
-   权限选择 Public 或 Private 均可。
    

#### 3\. 创建 Dockerfile

在 Hugging Face Space 的文件列表里，直接新建一个名为 Dockerfile 的文件，内容如下：

<br>

```
# 替换为您的 GHCR 镜像地址
FROM ghcr.io/您的用户名/您的仓库名:latest

# 如果您的镜像默认启动命令没有暴露 7860 端口，可以在这里重写 EXPOSE 和 CMD
# EXPOSE 7860
```
```
保存后，Hugging Face 会自动拉取您的 GHCR 镜像并运行。    
用变量形式保存上游服务器地址：
打开您的 Hugging Face Space 页面。
点击顶部的 Settings（设置）选项卡。
向下滚动到 Variables and secrets（变量与凭据）区域。
您会看到两个选项：
New secret（推荐）：用于保存敏感信息（如服务器密码、Token、私密 IP）。添加后内容会被加密，外部无法查看。
New variable：用于保存非敏感信息（如公共 API 地址、版本号）。添加后公开可见。
示例：
添加一个名为 UPSTREAM_SERVER_URL 的 Secret，Value 填写您的上游服务器地址（例如 https://your-upstream-server.com 或 http://1.2.3.4:8080）。
```
