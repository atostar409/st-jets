# GitHub 发布教程（小白友好版）

目标：把这个插件发布到你自己的 GitHub 仓库，让别人在酒馆里**粘贴一个链接**就能安装。

全程约 10 分钟，不需要任何 Git 基础。

---

## 第 0 步：注册 GitHub 账号

1. 打开 <https://github.com/signup>
2. 填邮箱 → 设置密码 → 取用户名（后面用 `<你的用户名>` 代替，记住它）
3. 邮箱验证完成后进入主页即可

## 第 1 步：创建一个空仓库

1. 点右上角 **`+`** → **New repository**
2. Repository name 填：`st-jets`（必须是小写英文，建议就用这个名字）
3. 选 **Public**（必须公开，别人才能安装）
4. **其他什么都不勾**（不要勾 README / .gitignore / License，我们要传的是现成文件）
5. 点 **Create repository**
6. 创建完成后，页面会显示你的仓库地址，长这样：
   `https://github.com/<你的用户名>/st-jets`
   —— 这就是将来给别人安装用的链接，先复制存好。

## 第 2 步：上传插件文件

两种方式任选其一。**方式 A 最简单**，第一次发布推荐用 A。

### 方式 A：网页上传（最简单）

1. 在刚创建好的仓库页面，点 **uploading an existing file** 链接
   （或者点 **Add file → Upload files**）
2. 打开插件文件夹：
   `SillyTavern\data\default-user\extensions\third-party\st-jets`
   （旧版路径可能是 `SillyTavern\public\scripts\extensions\third-party\st-jets`）
3. 把文件夹**里面的所有文件**拖进上传页（index.js、style.css、manifest.json、src、docs、LICENSE、README.md 等）
   - ⚠️ 注意是"文件夹里面的内容"，不是把 st-jets 文件夹本身拖进去
   - ⚠️ `.git` 文件夹（如果资源管理器里看得到）**不要**拖，网页也传不了它
   - ✅ 关键检查：`manifest.json` 必须在仓库**根目录**（点开仓库首页第一眼就能看到它），否则酒馆安装会报 "Manifest file not found"
4. 拖完后在页面底部 Commit changes 填个说明（比如 `发布 0.3.0`），点 **Commit changes**
5. 完成！跳到第 3 步。

以后更新版本：重复方式 A 上传覆盖（文件名相同的会自动替换），再提交即可。

### 方式 B：Git 命令（适合以后长期维护）

在你的电脑上打开 Git Bash（装过 Git 就有；没有就去 <https://git-scm.com> 装一个）：

```bash
# 1. 进入插件目录
cd /f/SillyTavern/SillyTavern-1.17.0/public/scripts/extensions/third-party/st-jets

# 2. 把仓库关联到你的 GitHub（替换 <你的用户名>）
git remote add origin https://github.com/<你的用户名>/st-jets.git
# 如果提示 remote origin already exists，先执行：git remote remove origin，再执行上面那条

# 3. 推送
git push -u origin main
```

推送时会弹出 GitHub 登录窗口，按提示用浏览器授权即可。

> 如果 push 报错（历史太浅等原因），用下面几条命令重开一个干净的仓库再推：
>
> ```bash
> rm -rf .git
> git init -b main
> git config user.name "<你的用户名>"
> git config user.email "<你的GitHub邮箱>"
> git remote add origin https://github.com/<你的用户名>/st-jets.git
> git add -A
> git commit -m "发布 0.3.0"
> git push -u origin main
> ```
>
> 以后每次改完文件，发布更新只需三条：
>
> ```bash
> git add -A
> git commit -m "更新说明"
> git push
> ```

## 第 3 步：在酒馆里安装（别人也会这样装）

1. 打开 SillyTavern → 顶部**扩展**图标（插头样子）
2. 点 **安装扩展 / Install extension**
3. 粘贴仓库地址：`https://github.com/<你的用户名>/st-jets`
4. 确认，完成 ✅

**更新**：别人在扩展列表里点 **更新 / Update**，然后刷新酒馆页面即可拿到新版本。
你推送/上传新版本后，版本号记得改 `manifest.json` 里的 `version`（比如 `0.3.1`），别人那边才看得出更新了。

## 第 4 步（可选）：完善仓库信息

- 打开 `manifest.json`，把 `homePage` 加上你的仓库地址（如果以后要填）：
  `"homePage": "https://github.com/<你的用户名>/st-jets"`
- 在仓库页面点 **About** ⚙ 可加描述和主题标签（如 `sillytavern`、`extension`），方便被搜到

## 常见问题

**Q：安装时报 "Manifest file not found"？**
A：`manifest.json` 没传到仓库根目录。多半是把文件传进了子文件夹，进仓库把文件移到最外层。

**Q：安装后没有反应？**
A：刷新酒馆页面（Ctrl+F5）。手机端关掉标签页重开。

**Q：别人怎么用？**
A：把你的仓库链接发出去即可，安装方法就是第 3 步。
