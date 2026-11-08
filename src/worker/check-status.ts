import "dotenv/config";
import prisma from "../lib/db";

async function main() {
  const totalJobs = await prisma.job.count();
  const indiaJobs = await prisma.job.count({
    where: {
      OR: [
        { location: { contains: "india", mode: "insensitive" } },
        { location: { contains: "bengaluru", mode: "insensitive" } },
        { location: { contains: "bangalore", mode: "insensitive" } },
        { location: { contains: "hyderabad", mode: "insensitive" } },
        { location: { contains: "pune", mode: "insensitive" } },
        { location: { contains: "gurgaon", mode: "insensitive" } },
        { location: { contains: "noida", mode: "insensitive" } },
        { location: { contains: "mumbai", mode: "insensitive" } },
        { location: { contains: "chennai", mode: "insensitive" } },
        { location: { contains: "delhi", mode: "insensitive" } },
      ],
    },
  });

  const companiesWithIndiaJobs = await prisma.company.findMany({
    where: {
      jobs: {
        some: {
          OR: [
            { location: { contains: "india", mode: "insensitive" } },
            { location: { contains: "bengaluru", mode: "insensitive" } },
            { location: { contains: "hyderabad", mode: "insensitive" } },
            { location: { contains: "pune", mode: "insensitive" } },
          ],
        },
      },
    },
    select: {
      name: true,
      atsType: true,
      _count: { select: { jobs: true } },
    },
  });

  console.log({
    totalJobs,
    indiaJobs,
    companiesCount: companiesWithIndiaJobs.length,
    companies: companiesWithIndiaJobs.slice(0, 15),
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
