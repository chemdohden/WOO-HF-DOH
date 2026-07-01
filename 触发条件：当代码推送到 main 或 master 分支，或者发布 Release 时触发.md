为了在 GitHub 上实现自动构建并打包 Docker 镜像，最方便且省心的方法是使用 **GitHub Container Registry (GHCR)**。这是 GitHub 自带的容器镜像托管服务，**不需要您配置任何第三方账号或密码（Secrets）**，完全基于 GitHub 内置的安全凭证自动完成。

以下是为您配置的 GitHub Actions 工作流。

---

### 第一步：在项目中创建工作流文件

请在您的 GitHub 仓库根目录下，创建以下路径的文件夹和文件：
`配置路径：.github/workflows/docker-publish.yml`

将以下 YAML 内容完整复制到该文件中：

```yaml
name: Build and Push Docker Image

# 触发条件：当代码推送到 main 或 master 分支，或者发布 Release 时触发
on:
  push:
    branches:
      - main
      - master
    tags:
      - 'v*'
  # 支持手动在 Actions 页面点击触发
  workflow_dispatch:

# 授予工作流向 GitHub Packages (GHCR) 写入镜像的权限
permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  # 镜像名称会自动转换为：ghcr.io/您的用户名/您的仓库名
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      # 1. 拉取仓库代码
      - name: Checkout repository
        uses: actions/checkout@v4

      # 2. 设置 Docker Buildx（用于支持多平台构建或缓存优化）
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # 3. 登录到 GitHub Container Registry
      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # 4. 提取镜像标签和元数据（自动处理大小写转换，避免 Docker 命名规范冲突）
      - name: Extract metadata (tags, labels) for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable=${{ github.ref_name == 'main' || github.ref_name == 'master' }}
            type=semver,pattern={{version}}
            type=sha,format=short

      # 5. 构建并推送 Docker 镜像
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ id.meta.outputs.tags }}
          labels: ${{ id.meta.outputs.labels }}
          # 启用缓存，加速后续构建
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

### 第二步：推送代码到 GitHub

将上述文件提交并推送到您的 GitHub 仓库：

```bash
git add .github/workflows/docker-publish.yml
git commit -m "add github action for docker build"
git push origin main
```

推送完成后，点击您 GitHub 仓库页面的 **Actions** 标签卡，就能看到名为 `Build and Push Docker Image` 的工作流正在自动运行。运行成功后，镜像会自动发布到您的 GitHub 个人主页的 **Packages** 中。

---

### 第三步：如何下载和运行生成的镜像？

构建完成后，您的镜像地址通常为：
`ghcr.io/您的github用户名/您的仓库名:latest` *(注意：地址中的用户名和仓库名会被自动转换为全小写)*

您可以在服务器上直接通过以下方式拉取并运行该镜像（结合我们上一步提到的数据持久化挂载）：

```bash
# 1. 确保宿主机上已创建挂载文件
touch /home/ubuntu/dns-data/upstreams.json

# 2. 拉取并运行您在 GitHub 构建的镜像
docker run -d \
  -p 7860:7860 \
  -v /home/ubuntu/dns-data/upstreams.json:/usr/src/app/upstreams.json \
  --name dns-bridge \
  --restart unless-stopped \
  ghcr.io/您的github用户名/您的仓库名:latest
```

*(如果您的仓库是**私有**的，在服务器上拉取镜像前可能需要先执行 `docker login ghcr.io` 登录您的 GitHub 账号。如果是公开仓库，则可以直接拉取。)*
