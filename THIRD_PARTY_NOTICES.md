# Third-party notices

Taskmap uses the following direct dependencies. Installed versions are recorded in `package-lock.json`; each package retains its own license. The application license does not replace third-party licenses.

| Dependency | License |
| --- | --- |
| Axios | MIT |
| flag-icons | MIT |
| React and React DOM | MIT |
| React Flow | MIT |
| Inter via `@fontsource/inter` | SIL Open Font License 1.1 |
| Tailwind CSS and `@tailwindcss/vite` | MIT |
| Vite and `@vitejs/plugin-react` | MIT |
| React and Node type definitions | MIT |
| TypeScript | Apache License 2.0 |

The lockfile also identifies transitive dependencies and their licenses. When redistributing dependency code or a compiled build, retain applicable copyright and license notices from the installed packages, including any additional transitive notices. Do not copy a dependency's assets into another project without its accompanying license.

## Lineicons

The icon font files, SVG font and stylesheet in `public/lineicons/` come from Lineicons 1.3.2. The copied font assets match that package's files. They are distributed under the MIT license, copyright © 2023 Lineicons. The full notice is retained in [docs/third-party/LINEICONS_LICENSE.txt](docs/third-party/LINEICONS_LICENSE.txt).

Copies of both font licenses are also in `public/third-party/`, so Vite includes them in deployed builds.

## Inter

Inter is bundled locally through `@fontsource/inter` and is licensed under the SIL Open Font License 1.1, copyright © 2016 The Inter Project Authors. Retain the font's license when redistributing font files. The primary license is available in [the Inter project](https://github.com/rsms/inter/blob/master/LICENSE.txt); a copy accompanies this release in [docs/third-party/INTER_LICENSE.txt](docs/third-party/INTER_LICENSE.txt).

Product names and trademarks remain the property of their respective owners. Jira and Atlassian names describe compatibility and do not imply endorsement.
