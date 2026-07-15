// @linx/kernel-types — 零依赖零 I/O 的类型基元。依赖树叶子，任何层皆可依赖。

declare const brand: unique symbol

/**
 * 名义类型（Branded type）：在结构类型系统上加编译期标签，
 * 防止 TaskId 被误传到需要 UserId 的位置等 id 串用问题。
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B }

/** 不透明别名（语义等价 Brand，强调「外部不应窥探内部结构」） */
export type Opaque<T, B extends string> = Brand<T, B>

/** 通用 UUID 品牌类型（具体前缀化 id 见 @linx/kernel-ids） */
export type Uuid = Brand<string, 'Uuid'>

/** 深只读：递归冻结对象/数组的类型（领域值对象不可变约束） */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

/** 至少含一个键的对象（用于「patch 不能为空」等约束） */
export type NonEmptyObject<T> = keyof T extends never ? never : T
