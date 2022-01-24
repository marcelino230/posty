import {
  Resolver,
  Query,
  Arg,
  Mutation,
  UseMiddleware,
  Ctx,
  Int,
  FieldResolver,
  Root,
  Field,
  ObjectType,
} from "type-graphql";
import { getConnection, getManager } from "typeorm";
import { isAuth } from "../entity/middleware/isAuth";
import { Post } from "../entity/Post";
import { Vote } from "../entity/Vote";
import { MyContext } from "../types";
import { FieldError } from "../utils/classes";
import { validateCreatePost } from "../utils/validateCreatePost";

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];

  @Field()
  hasMore: boolean;
}

@ObjectType()
class CreatePostResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => Post, { nullable: true })
  post?: Post;
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textShortened(@Root() root: Post) {
    return root.text.slice(0, 50);
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg("postId", () => Int) postId: number,
    @Arg("value", () => Int) value: number,
    @Ctx() { req }: MyContext
  ): Promise<Boolean> {
    const { userId } = req.session;

    const vote = await Vote.findOne({ postId, userId });
    const isUpvote = value !== -1;
    const realValue = isUpvote ? 1 : -1;

    //transactions
    // change opinion, wants to upvote/downvote instead.
    if (vote && realValue !== vote.value) {
      await getManager().transaction(async (transactionalEntityManager) => {
        transactionalEntityManager.query(
          `
          update vote
          set value = $1
          where "postId" = $2 AND "userId" = $3
          `,
          [realValue, postId, userId]
        );

        transactionalEntityManager
          .createQueryBuilder()
          .update(Post)
          .set({ points: () => `points+${2 * realValue}` })
          .where("id = :id", { id: postId })
          .execute();
      });
    } else if (!vote) {
      await getManager().transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.insert(Vote, {
          userId,
          postId,
          value: realValue,
        });
        await transactionalEntityManager
          .createQueryBuilder()
          .update(Post)
          .set({ points: () => `points+${realValue}` })
          .where("id = :id", { id: postId })
          .execute();
      });
    }
    return true;
  }

  @Query(() => PaginatedPosts) //return array of posts.
  async posts(
    // pagination, orderded by new.
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null,
    @Ctx() { req }: MyContext
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit);

    const replacements: any[] = [realLimit + 1];

    if (req.session.userId) {
      replacements.push(req.session.userId);
    }
    let cursorIndex = 3; // second parameter $2 can be the cursor if there's no user session.
    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
      cursorIndex = replacements.length;
    }

    const posts = await getConnection().query(
      `
    SELECT p.*,
    json_build_object(
      'id', u.id,
      'username', u.username,
      'email', u.email,
      'created_at', u.created_at,
      'updated_at', u.updated_at
    ) creator,
    ${
      req.session.userId
        ? '(SELECT value FROM vote WHERE "userId" = $2 and "postId" = p.id) "voteStatus"'
        : 'null as "voteStatus"'
    }
    FROM post p
    INNER JOIN PUBLIC.user u on u.id = p."creatorId"
    ${cursor ? `WHERE p."created_at" < $${cursorIndex}` : ""}
    ORDER BY p."created_at" DESC
    limit $1
    `,
      replacements
    );

    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimit + 1,
    };
  }

  @Query(() => Post, { nullable: true })
  async post(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<Post | undefined> {
    const replacements: any[] = [id];
    if (req.session.userId) {
      replacements.push(req.session.userId);
    }

    const post = await getConnection().query(
      `
      SELECT p.*,p.id,
      json_build_object(
      'id', u.id,
      'username', u.username,
      'email', u.email,
      'created_at', u.created_at,
      'updated_at', u.updated_at
      ) creator,
      ${
        req.session.userId
          ? '(SELECT value FROM vote WHERE "userId" = $2 and "postId" = p.id) "voteStatus"'
          : 'null as "voteStatus"'
      }
      FROM post p
      INNER JOIN PUBLIC.user u on u.id = p."creatorId"
      WHERE p.id = $1
    `,
      replacements
    );
    return post[0];
  }

  @Mutation(() => CreatePostResponse)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg("title") title: string,
    @Arg("text") text: string,
    @Ctx() { req }: MyContext
  ): Promise<CreatePostResponse> {
    const errors = validateCreatePost(title, text);
    if (errors) return { errors };

    const post = await Post.create({
      title,
      text,
      creatorId: req.session.userId,
    }).save();
    return { post };
  }

  @Mutation(() => CreatePostResponse, { nullable: true })
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg("text") text: string,
    @Arg("id", () => Int) id: number,
    @Arg("title") title: string,
    @Ctx() { req }: MyContext
  ): Promise<CreatePostResponse | null> {
    const post = await Post.findOne({ id, creatorId: req.session.userId });
    if (!post) return null;
    const errors = validateCreatePost(title, text);
    if (errors) return { errors };
    post.text = text;
    post.title = title;
    await Post.save(post);
    return { post };
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<Boolean> {
    await Post.delete({ id, creatorId: req.session.userId });
    return true;
  }
}
