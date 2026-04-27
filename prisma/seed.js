import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // feeling
  const feelings = [
    // --- NHÓM CẢM XÚC (feeling) ---
    { displayText: "đang cảm thấy hạnh phúc", icon: "😊", type: "feeling" },
    { displayText: "đang cảm thấy tuyệt vời", icon: "🤩", type: "feeling" },
    { displayText: "đang cảm thấy yêu đời", icon: "🥰", type: "feeling" },
    { displayText: "đang cảm thấy biết ơn", icon: "😇", type: "feeling" },
    { displayText: "đang cảm thấy hào hứng", icon: "😃", type: "feeling" },
    { displayText: "đang cảm thấy điên rồ", icon: "🤪", type: "feeling" },
    { displayText: "đang cảm thấy thú vị", icon: "😆", type: "feeling" },
    { displayText: "đang cảm thấy thư giãn", icon: "😌", type: "feeling" },
    { displayText: "đang cảm thấy tích cực", icon: "😎", type: "feeling" },
    { displayText: "đang cảm thấy hy vọng", icon: "🤞", type: "feeling" },
    { displayText: "đang cảm thấy may mắn", icon: "🍀", type: "feeling" },
    { displayText: "đang cảm thấy buồn", icon: "😢", type: "feeling" },
    { displayText: "đang cảm thấy cô đơn", icon: "😟", type: "feeling" },
    { displayText: "đang cảm thấy mệt mỏi", icon: "😫", type: "feeling" },
    { displayText: "đang cảm thấy chán nản", icon: "😑", type: "feeling" },
    { displayText: "đang cảm thấy tức giận", icon: "😡", type: "feeling" },
    { displayText: "đang cảm thấy lo lắng", icon: "😰", type: "feeling" },
    { displayText: "đang cảm thấy sốc", icon: "😱", type: "feeling" },
    { displayText: "đang cảm thấy đói", icon: "🤤", type: "feeling" },
    { displayText: "đang cảm thấy ngọt ngào", icon: "😋", type: "feeling" },

    // --- NHÓM HÀNH ĐỘNG (activity) ---
    // Xem
    { displayText: "đang xem phim", icon: "🎬", type: "activity" },
    { displayText: "đang xem YouTube", icon: "📺", type: "activity" },
    { displayText: "đang xem bóng đá", icon: "⚽", type: "activity" },
    { displayText: "đang xem Netflix", icon: "🎥", type: "activity" },
    // Nghe
    { displayText: "đang nghe nhạc", icon: "🎧", type: "activity" },
    { displayText: "đang nghe podcast", icon: "🎙️", type: "activity" },
    { displayText: "đang nghe Spotify", icon: "🎵", type: "activity" },
    // Ăn/Uống
    { displayText: "đang ăn tối", icon: "🍱", type: "activity" },
    { displayText: "đang uống cà phê", icon: "☕", type: "activity" },
    { displayText: "đang uống trà sữa", icon: "🧋", type: "activity" },
    { displayText: "đang nhậu", icon: "🍺", type: "activity" },
    { displayText: "đang ăn Pizza", icon: "🍕", type: "activity" },
    // Thể thao/Giải trí
    { displayText: "đang chơi game", icon: "🎮", type: "activity" },
    { displayText: "đang tập gym", icon: "🏋️", type: "activity" },
    { displayText: "đang chạy bộ", icon: "🏃", type: "activity" },
    { displayText: "đang bơi lội", icon: "🏊", type: "activity" },
    { displayText: "đang đọc sách", icon: "📖", type: "activity" },
    { displayText: "đang đi du lịch", icon: "✈️", type: "activity" },
    { displayText: "đang mua sắm", icon: "🛍️", type: "activity" },
    { displayText: "đang làm việc", icon: "💻", type: "activity" },
    { displayText: "đang học bài", icon: "📚", type: "activity" },
  ];

  for (const f of feelings) {
    await prisma.feelingMaster.create({
      data: f,
    });
  }

  // event category
  const eventCategories = [
    { keyName: "work", displayName: "Công việc", icon: "💼" },
    { keyName: "education", displayName: "Học vấn", icon: "🎓" },
    { keyName: "family", displayName: "Gia đình", icon: "🏠" },
    { keyName: "relationship", displayName: "Mối quan hệ", icon: "❤️" },
  ];

  for (const eC of eventCategories) {
    await prisma.eventCategory.create({
      data: eC,
    });
  }

  const workEvent = await prisma.eventCategory.findFirst({
    where: {
      keyName: "work",
    },
  });
  const educationEvent = await prisma.eventCategory.findFirst({
    where: {
      keyName: "education",
    },
  });
  const familyEvent = await prisma.eventCategory.findFirst({
    where: {
      keyName: "family",
    },
  });
  const relationshipEvent = await prisma.eventCategory.findFirst({
    where: {
      keyName: "relationship",
    },
  });

  // event master
  const workMasters = [
    {
      eventCategoryId: workEvent.id,
      keyName: "new_job",
      displayText: "New Job",
      icon: "💼",
    },
    {
      eventCategoryId: workEvent.id,
      keyName: "promotion",
      displayText: "Promotion",
      icon: "📈",
    },
    {
      eventCategoryId: workEvent.id,
      keyName: "left_job",
      displayText: "Left job",
      icon: "👋",
    },
    {
      eventCategoryId: workEvent.id,
      keyName: "retirement",
      displayText: "Retirement",
      icon: "🏖️",
    },
  ];
  const educationMasters = [
    {
      eventCategoryId: educationEvent.id,
      keyName: "new_school",
      displayText: "New School",
      icon: "🏫",
    },
    {
      eventCategoryId: educationEvent.id,
      keyName: "graduated",
      displayText: "Graduated",
      icon: "🎓",
    },
    {
      eventCategoryId: educationEvent.id,
      keyName: "left_school",
      displayText: "Left School",
      icon: "🏢",
    },
  ];
  const familyMasters = [
    {
      eventCategoryId: familyEvent.id,
      keyName: "new_child",
      displayText: "New Child",
      icon: "👶",
    },
    {
      eventCategoryId: familyEvent.id,
      keyName: "parenthood",
      displayText: "Parenthood",
      icon: "👪",
    },
    {
      eventCategoryId: familyEvent.id,
      keyName: "new_pet",
      displayText: "New Pet",
      icon: "🐾",
    },
    {
      eventCategoryId: familyEvent.id,
      keyName: "loss_loved_one",
      displayText: "Loss of a Loved One",
      icon: "🕯️",
    },
  ];
  const relationshipMasters = [
    {
      eventCategoryId: relationshipEvent.id,
      keyName: "new_relationship",
      displayText: "New Relationship",
      icon: "👩‍❤️‍👨",
    },
    {
      eventCategoryId: relationshipEvent.id,
      keyName: "engagement",
      displayText: "Engagement",
      icon: "💎",
    },
    {
      eventCategoryId: relationshipEvent.id,
      keyName: "marriage",
      displayText: "Marriage",
      icon: "💍",
    },
    {
      eventCategoryId: relationshipEvent.id,
      keyName: "first_met",
      displayText: "First Met",
      icon: "🥂",
    },
  ];

  for (const work of workMasters) {
    await prisma.eventMaster.create({
      data: work,
    });
  }

  for (const education of educationMasters) {
    await prisma.eventMaster.create({
      data: education,
    });
  }

  for (const family of familyMasters) {
    await prisma.eventMaster.create({
      data: family,
    });
  }

  for (const relationship of relationshipMasters) {
    await prisma.eventMaster.create({
      data: relationship,
    });
  }

  // postPrivacy
  const postPrivacies = [
    {
      name: "public",
      description:
        "Công khai: Bất kỳ ai trên hoặc ngoài hệ thống đều có thể xem.",
    },
    {
      name: "friends",
      description: "Bạn bè: Chỉ những người là bạn bè của bạn mới có thể xem.",
    },
    {
      name: "friends_except",
      description:
        "Bạn bè ngoại trừ...: Hiển thị với bạn bè ngoại trừ những người bạn chọn.",
    },
    {
      name: "specific_friends",
      description: "Bạn bè cụ thể: Chỉ hiển thị với những người bạn nhất định.",
    },
    {
      name: "private",
      description: "Chỉ mình tôi: Chỉ bạn mới có thể xem bài viết này.",
    },
    {
      name: "custom",
      description:
        "Tùy chỉnh: Bao gồm hoặc loại trừ người xem theo danh sách riêng.",
    },
  ];

  for (const postPrivacy of postPrivacies) {
    await prisma.postPrivacy.create({
      data: postPrivacy,
    });
  }

  // reactionMaster — 7 loại reaction giống Facebook
  const reactions = [
    { keyName: "like", displayText: "Like", icon: "👍" },
    { keyName: "love", displayText: "Love", icon: "❤️" },
    { keyName: "care", displayText: "Care", icon: "🤗" },
    { keyName: "haha", displayText: "Haha", icon: "😂" },
    { keyName: "wow", displayText: "Wow", icon: "😮" },
    { keyName: "sad", displayText: "Sad", icon: "😢" },
    { keyName: "angry", displayText: "Angry", icon: "😡" },
  ];

  for (const reaction of reactions) {
    await prisma.reactionMaster.create({
      data: reaction,
    });
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
