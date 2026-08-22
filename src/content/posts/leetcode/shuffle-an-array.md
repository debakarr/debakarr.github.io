---
title: "[LeetCode] 384. Shuffle an Array"
date: "2019-09-06"
description: "Shuffle an Array Link to original Problem on LeetCode Shuffle a set of numbers without duplicates. Example: // Init an array with set 1, 2, and 3. int[] nums = {1,2,3}; Solution solution = new Solution(nums); // Shuffle the array [1,2,3] and return its result. Any permutation of [1,2,3] must equally likely to be returned. solution.shuffle(); // Resets the array back to its original configuration [1,2,3]. solution.reset(); // Returns the random shuffling of array [1,2,3]."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Shuffle", "Arrays", "Randomization", "Programming"]
draft: false
---

### Shuffle an Array

[Link to original Problem on LeetCode](https://leetcode.com/problems/shuffle-an-array/)

Shuffle a set of numbers without duplicates.

Example:

```
// Init an array with set 1, 2, and 3.
int[] nums = {1,2,3};
Solution solution = new Solution(nums);

// Shuffle the array [1,2,3] and return its result. Any permutation of [1,2,3] must equally likely to be returned.
solution.shuffle();

// Resets the array back to its original configuration [1,2,3].
solution.reset();

// Returns the random shuffling of array [1,2,3].
solution.shuffle();
```

**Company:** *Facebook*

**Solution**

**Time Complexity:** **Space Complexity:**

```python
class Solution(object):
    # This solution is based on python inbuild random method
    def __init__(self, nums):
        """
        :type nums: List[int]
        """
        self.array = nums
        self.original = nums[:]
        

    def reset(self):
        """
        Resets the array to its original configuration and return it.
        :rtype: List[int]
        """
        self.array = self.original[:]
        return self.array
        

    def shuffle(self):
        """
        Returns a random shuffling of the array.
        :rtype: List[int]
        """
        for i in range(len(self.array)):
            swapIndex = random.randrange(0, len(self.array))
            self.array[i], self.array[swapIndex] = self.array[swapIndex], self.array[i]
            
        return self.array


# Your Solution object will be instantiated and called as such:
# obj = Solution(nums)
# param_1 = obj.reset()
# param_2 = obj.shuffle()
```
