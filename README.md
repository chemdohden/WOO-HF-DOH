## DoH服务器，上游支持传统DNS-53查询。下游支持doh，不支持传统DNS-53查询。




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

在 Hugging Face Space 的文件列表里，直接新建一个名为 `Dockerfile` 的文件，内容如下：

<br>

```
# 替换为您的 GHCR 镜像地址
FROM ghcr.io/您的用户名/您的仓库名:latest

# 如果您的镜像默认启动命令没有暴露 7860 端口，可以在这里重写 EXPOSE 和 CMD
# EXPOSE 7860
```
<br>


### 如何在 Hugging Face 中配置这些上游？

修改代码后，请按以下步骤在 Hugging Face 控制台中进行配置：

-   进入您的 Space 页面，点击顶部的 **Settings**。
    
-   找到 **Variables and secrets**。
    
-   点击 **New secret** (或者 New Variable，因为 DNS 地址通常不属于极度敏感信息)。
    
-   按以下规则填写：
    
    -   **Name**: `UPSTREAMS`
        
    -   **Value**: 填入您的多个上游地址，**使用英文逗号 , 分隔**。
        
        > **例如**：https://9.9.9.9/dns-query, 1.1.1.1, 8.8.8.8:53
        
    
-   保存后，由于环境变量更新，Hugging Face 会自动重新启动您的容器并应用此配置。此配置将被永久记住，不因容器重启而丢失。
    
-   如果您在网页端页面上临时修改并保存了配置，它会在容器活动期间保持生效。一旦容器重启，它会自动回退到您在 UPSTREAMS 里填写的地址。
