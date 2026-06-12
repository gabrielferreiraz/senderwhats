import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const stats = await prisma.$transaction(async (tx) => {
      // 1. Find all contacts linked to this list
      const items = await tx.contactListItem.findMany({
        where: { listId: id },
        select: { contactId: true },
      })

      const contactIds = items.map((i) => i.contactId)

      // 2. For each contact: check other list associations + campaign history
      const toDelete: string[] = []
      for (const contactId of contactIds) {
        const [otherLists, campaignMessages] = await Promise.all([
          tx.contactListItem.count({
            where: { contactId, listId: { not: id } },
          }),
          tx.campaignMessage.count({ where: { contactId } }),
        ])
        if (otherLists === 0 && campaignMessages === 0) {
          toDelete.push(contactId)
        }
      }

      // 3. Permanently delete orphaned contacts (ContactListItems cascade via onDelete: Cascade)
      if (toDelete.length > 0) {
        await tx.contact.deleteMany({ where: { id: { in: toDelete } } })
      }

      // 4. Delete the list itself (remaining ContactListItems for kept contacts cascade-delete)
      await tx.contactList.delete({ where: { id } })

      return {
        contactsDeleted: toDelete.length,
        contactsKept: contactIds.length - toDelete.length,
      }
    })

    return NextResponse.json({ ok: true, stats })
  } catch {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })
  }
}
