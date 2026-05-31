import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { AvailabilityForm } from "./_AvailabilityForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AvailabilityPage({ params }: PageProps) {
  const { id } = await params;
  const teacher = await prisma.user.findUnique({
    where: { id },
    include: { availability: true },
  });
  if (!teacher || teacher.role !== Role.TEACHER) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{teacher.name} 선생님 가용 요일</CardTitle>
      </CardHeader>
      <CardContent>
        <AvailabilityForm
          teacherId={teacher.id}
          initial={teacher.availability.map((a) => ({
            weekday: a.weekday,
            hours: a.hours,
          }))}
        />
      </CardContent>
    </Card>
  );
}
