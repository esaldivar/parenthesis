# SonarQube Cloud setup (Free plan)

SonarQube Cloud checks code quality, security issues and vulnerabilities in C# and TypeScript. The repository is
public, so the **Free plan** costs nothing and has no line limit. On that plan Sonar analyses the **main** branch:
PRs into `main` (releases from `develop`, and hotfixes), plus `main` itself after each merge. The workflow
(`.github/workflows/sonar.yml`) is already in place. It stays skipped until the steps below are done.

Only the repository owner can do steps 1–4, because they involve signing in and creating an access token. Never paste
the token into chat, an issue or a file.

## 1. Sign in and import the repository
1. Go to <https://sonarcloud.io> and choose **Log in → GitHub**.
2. Choose **+ → Analyze new project → Import an organization from GitHub**.
3. Install the SonarQube Cloud GitHub app on the `esaldivar` account, and give it access to the `parenthesis`
   repository only.
4. Pick the **Free** plan. Note the **organization key** (for example `esaldivar`).
5. Select `parenthesis` and choose **Set up**. Note the **project key** (usually `esaldivar_parenthesis`).

## 2. Use GitHub Actions, not Automatic Analysis
C# can only be analysed from a build, so the analysis runs in our pipeline.
- In the project, go to **Administration → Analysis Method** and **turn off Automatic Analysis**.
- Under **Administration → Branches**, check that the main branch is `main`.

## 3. Create the token
- Go to **My Account → Security → Generate token**. Name it `parenthesis-github-actions` and copy it.

## 4. Add it to GitHub
On GitHub, open `esaldivar/parenthesis` and go to **Settings → Secrets and variables → Actions**.
- On the **Secrets** tab, add a new repository secret: `SONAR_TOKEN`, set to the token from step 3.
- On the **Variables** tab, add two variables: `SONAR_ORGANIZATION`, set to the organization key, and
  `SONAR_PROJECT_KEY`, set to the project key.

## 5. Then (Claude or any maintainer)
- Open or re-run a PR into `main`. The **SonarQube Cloud** check runs and the quality gate result appears on the PR.
- Once it passes, add **SonarQube Cloud** to `main`'s required status checks, so a failing quality gate blocks
  releases.
- Also add **Release security gate**, which blocks releases with unresolved security findings. See
  [sonar-release-gate.md](sonar-release-gate.md).
- Use the default **Sonar way** quality gate to start with.
- Add the Sonar quality-gate badge to the README.

## Also free: SonarQube for IDE
Install **SonarQube for IDE** (formerly SonarLint) in VS Code, Visual Studio or Rider. It flags the same kinds of
issues while you type. Connect it to the SonarQube Cloud project (connected mode) so it uses the same rules.
