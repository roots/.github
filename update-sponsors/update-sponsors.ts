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
  try {
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
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error', error.message);
    }
  }

  console.log(data);
  const totalCount = data.data.organization.sponsorshipsAsMaintainer.totalCount
  console.log(`Total sponsors: ${totalCount}`);

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
      startWith: '<!-- replace-sponsors-start -->',
      endWith: '<!-- replace-sponsors-end -->',
      replaceWith: `<!-- replace-sponsors-start -->
${code}
<!-- replace-sponsors-end -->`,
    }),
    'utf-8',
  )
}

main()
