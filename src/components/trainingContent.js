export function normalizeCourseResponse(payload) {
  const courses = Array.isArray(payload?.courses) ? payload.courses : [];
  return courses.map((course) => ({
    ...course,
    accessReason: course.accessReason || null,
    isPro: Boolean(course.is_pro || course.isPro),
    lessons: (Array.isArray(course.lessons) ? course.lessons : []).map((lesson) => ({
      ...lesson,
      courseLocked: Boolean(course.isLocked),
      accessReason: course.accessReason || null,
      id: String(lesson.id),
      unitId: String(lesson.course_id || course.id),
      unitTitle: lesson.unit_title || lesson.unitTitle || 'Course lessons',
      lessonType: lesson.lesson_type || lesson.lessonType || 'practice',
      minWpm: Number(lesson.target_wpm || lesson.targetWpm || 0),
      minAccuracy: Number(lesson.target_accuracy || lesson.targetAccuracy || 0),
      duration: Number(lesson.duration_seconds || lesson.durationSeconds || 120),
      orderNumber: Number(lesson.order_number || lesson.orderNumber || 0),
      requiredPasses: 1,
    })),
  }));
}

export function flattenLessons(courses) {
  return courses.flatMap((course) => course.lessons || []);
}

export function getNextLessonId(lessons, lessonId) {
  const index = lessons.findIndex((lesson) => String(lesson.id) === String(lessonId));
  return index >= 0 && index < lessons.length - 1 ? lessons[index + 1].id : null;
}

export function getLessonById(lessons, lessonId) {
  return lessons.find((lesson) => String(lesson.id) === String(lessonId)) || null;
}
