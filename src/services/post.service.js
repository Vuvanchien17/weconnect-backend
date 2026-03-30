import prisma from "../config/prisma.js";

export const createFullPostService = async (
  files,
  userId,
  privacyId,
  blocks,
  taggedUserIds,
  collabUserIds,
) => {
  const newPost = await prisma.$transaction(async (tx) => {
    // create new post
    const post = await tx.post.create({
      data: {
        userId: BigInt(userId),
        privacyId: Number(privacyId),
      },
    });

    // handle blocks
    let imgCounter = 0;
    let videoCounter = 0;
    const processedBlocks = blocks.map((block) => {
      const newBlock = { ...block };
      console.log(newBlock);
      if (newBlock.type === "image" && files.image?.[imgCounter]) {
        newBlock.content = {
          ...newBlock.content,
          image: files.image?.[imgCounter].path,
          imageId: files.image?.[imgCounter].filename,
        };
        imgCounter++;
      } else if (newBlock.type === "video" && files.video?.[videoCounter]) {
        newBlock.content = {
          ...newBlock.content,
          video: files.video?.[videoCounter].path,
          videoId: files.video?.[videoCounter].filename,
        };
        videoCounter++;
      }
      return {
        postId: BigInt(post.id),
        type: newBlock.type,
        position: newBlock.position,
        content: newBlock.content,
      };
    });

    await tx.postBlock.createMany({
      data: processedBlocks,
    });

    // handle collabUserIds
    const filterCollabUserIds = collabUserIds.filter((id) => id != userId);

    // check exists of collabUser
    const validCollabUsers = await prisma.user.findMany({
      where: {
        id: { in: filterCollabUserIds.map((id) => BigInt(id)) },
        isDeleted: false,
      },
      select: { id: true },
    });

    const finalCollabUserIds = validCollabUsers.map((user) => user.id);
    const processedCollabUserIds = finalCollabUserIds.map((id) => ({
      postId: BigInt(post.id),
      inviterId: BigInt(userId),
      inviteeId: BigInt(id),
    }));

    // insert database table post_Collaborator
    await tx.postCollaborator.createMany({
      data: processedCollabUserIds,
    });

    // handle taggedUserIds
    // Remove yourself from the tag list
    const filteredTaggedIds = taggedUserIds.filter((id) => id != userId);

    // check exists of taggedUser
    const validUsers = await tx.user.findMany({
      where: {
        id: { in: filteredTaggedIds.map((id) => BigInt(id)) },
        isDeleted: false,
      },
      select: { id: true },
    });

    const finalIdstoTag = validUsers.map((user) => user.id);

    const processedTaggedUserIds = finalIdstoTag.map((id) => {
      return {
        postId: BigInt(post.id),
        taggedBy: BigInt(userId),
        taggedUserId: BigInt(id),
      };
    });

    // insert to database table post_tag
    await tx.postTag.createMany({
      data: processedTaggedUserIds,
    });

    const result = await tx.post.findUnique({
      where: { id: post.id },
      include: {
        postBlocks: {
          orderBy: { position: "asc" },
        },
        postTags: {
          include: {
            taggedUser: {
              include: {
                profile: true,
              },
            },
          },
        },
        postCollaborators: {
          include: {
            invitee: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    // return response forward to controller
    return {
      ...result,
      postTags: result.postTags.map((tag) => ({
        userId: tag.taggedUser.id,
        userName: tag.taggedUser.userName,
        displayName: tag.taggedUser.profile?.displayName,
        avatar: tag.taggedUser.profile?.avatar,
      })),
      postCollaborators: result.postCollaborators.map((collab) => ({
        userId: collab.invitee.id,
        userName: collab.invitee.userName,
        displayName: collab.invitee.profile?.displayName,
        avatar: collab.invitee.profile?.avatar,
        status: collab.status,
      })),
    };
  });

  return newPost;
};
