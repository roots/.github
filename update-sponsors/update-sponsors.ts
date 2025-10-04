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

  let allSponsors = [];
  let totalCount = 0;
  let hasNextPage = true;
  let endCursor = null;

  while (hasNextPage) {
    try {
      const cursorParam = endCursor ? `, after: "${endCursor}"` : '';

      const response = await axios.post(
        `https://api.github.com/graphql`,
        {
          query: `query {
            organization(login: "roots") {
              sponsorshipsAsMaintainer(first: 100${cursorParam}) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  createdAt
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

      const data = response.data;

      if (totalCount === 0) {
        totalCount = data.data.organization.sponsorshipsAsMaintainer.totalCount;
        console.log(`Total sponsors: ${totalCount}`);
      }

      const pageInfo = data.data.organization.sponsorshipsAsMaintainer.pageInfo;
      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;

      const currentSponsors = data.data.organization.sponsorshipsAsMaintainer.nodes;
      allSponsors = [...allSponsors, ...currentSponsors];

      console.log(`Retrieved ${allSponsors.length} of ${totalCount} sponsors`);

    } catch (error) {
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else if (error.request) {
        console.log(error.request);
      } else {
        console.log('Error', error.message);
      }
      break;
    }
  }

  if (allSponsors.length === 0) {
    console.log('No data');
    return;
  }

  const sponsors = allSponsors
    .map((node) => {
      // Calculate days as sponsor
      let daysAsSupporter = 0;
      if (node.createdAt) {
        const startDate = new Date(node.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - startDate.getTime());
        daysAsSupporter = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        monthlyPriceInDollars: node.tier?.monthlyPriceInDollars || 0,
        username: node.sponsorEntity.login,
        avatar: node.sponsorEntity.avatarUrl,
        private: node.privacyLevel === 'PRIVATE',
        daysAsSupporter: daysAsSupporter,
        createdAt: node.createdAt
      }
    })
    .filter((node) => {
      return node.monthlyPriceInDollars >= 7 && !node.private
    })
    .sort((a, b) => {
      // Sort by sponsorship duration (longest first)
      return b.daysAsSupporter - a.daysAsSupporter
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

  console.log(`Updated README with ${sponsors.length} sponsors`);
}

main()
