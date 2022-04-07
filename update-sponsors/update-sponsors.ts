import fs from 'fs'
import path from 'path'
import axios from 'axios'
import enquirer from 'enquirer'
import replaceSection from 'replace-section'

async function main() {
  const { token } = process.env.GH_TOKEN
    ? { token: process.env.GH_TOKEN }
    : await enquirer.prompt<{ token: string }>([
        {
          type: 'input',
          message: 'Paste GitHub Personal Access Token',
          name: 'token',
          required: true,
        },
      ])
  const { data } = await axios.post(
    `https://api.github.com/graphql
    `,
    {
      query: `query { 
        organization(login: "roots") { 
          sponsorshipsAsMaintainer(first: 100) {
            totalCount
            nodes {
              tier {
                monthlyPriceInDollars
              }
              sponsorEntity {
                ... on User {
                  login
                  avatarUrl
                }
                ... on Organization {
                  login
                  avatarUrl
                }
              }
            }
          }
        }
      }`,
    },
    {
      headers: {
        Authorization: `bearer ${token}`,
      },
    },
  )
  const totalCount = data.data.organization.sponsorshipsAsMaintainer.totalCount
  const sponsors = data.data.organization.sponsorshipsAsMaintainer.nodes
    .map((node) => {
      return {
        monthlyPriceInDollars: node.tier.monthlyPriceInDollars,
        username: node.sponsorEntity.login,
        avatar: node.sponsorEntity.avatarUrl,
        private: node.privacyLevel === 'PRIVATE',
      }
    })
    .filter((node) => {
      return node.monthlyPriceInDollars >= 7 && !node.private
    })
    .sort((a, b) => {
      return a.monthlyPriceInDollars > b.monthlyPriceInDollars ? -1 : 1
    })

  const code = sponsors
    .map((sponsor) => {
      return `<a title="${sponsor.username}" href="https://github.com/${sponsor.username}"><img src="${sponsor.avatar}" width="50" alt="${sponsor.username} avatar"></a>`
    })
    .join(' ')

  const profilePath = path.join(__dirname, '..', 'profile', 'README.md');
  const readme = await fs.promises.readFile(profilePath, 'utf8');
  await fs.promises.writeFile(
    profilePath,
    replaceSection({
      input: readme,
      startWith: '<!-- replace-sponsors -->',
      endWith: '<!-- replace-sponsors -->',
      replaceWith: `<!-- replace-sponsors -->
${code}

...and ${totalCount - sponsors.length} more
      <!-- replace-sponsors -->`,
    }),
    'utf-8',
  )
}

main()
